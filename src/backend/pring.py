"""普林格（Martin Pring《技術分析》）檢核表 —— src/utils/pring.js 的 Python 逐行移植。

前端個股頁用 JS 版即時算；後端策略選股要對整份清單算，所以這裡有一份 Python 版。
兩邊必須算出一樣的結果（多空判定、說明文字），scripts/verify-pring-parity.mjs
會用同一批 K 線同時餵兩邊逐項比對，改一邊就要改另一邊。

指標公式（SMA、EWMA、RSI、MACD、KD、布林）也照 src/utils/indicators.js 手刻，
不用 pandas 版本，否則初始值處理不同會讓兩邊在邊界上判定不一致。

輸入：bars = [{date, open, high, low, close, volume}, ...]，舊到新。
"""
from __future__ import annotations

import math

BULL, BEAR, NEUTRAL, NA = "bull", "bear", "neutral", "na"
STANCE_LABEL = {BULL: "偏多", BEAR: "偏空", NEUTRAL: "中性", NA: "資料不足"}


# ── 與 JS 一致的數字處理 ───────────────────────────────────────
def _r2(v):
    """JS 的 Math.round(v*100)/100：四捨五入往正無限大，不是 Python 的銀行家捨入。"""
    if v is None or not math.isfinite(v):
        return None
    return math.floor(v * 100 + 0.5) / 100


def _s(v):
    """數字轉字串，模仿 JS 樣板字串：整數不帶 .0、null 印 null。"""
    if v is None:
        return "null"
    if isinstance(v, float):
        if v == 0:
            return "0"
        if v.is_integer() and abs(v) < 1e21:
            return str(int(v))
        return repr(v)
    return str(v)


def _f(v):
    return _s(_r2(v))


def _pct(a, b):
    return (a - b) / b * 100


# ── 指標（對應 src/utils/indicators.js）────────────────────────
def sma(series, window):
    out = []
    for i in range(len(series)):
        if i < window - 1:
            out.append(None)
        else:
            out.append(sum(series[i - window + 1:i + 1]) / window)
    return out


def ewma(series, span):
    alpha = 2 / (span + 1)
    cur = series[0]
    out = [cur]
    for v in series[1:]:
        if v is not None and not (isinstance(v, float) and math.isnan(v)):
            cur = v * alpha + cur * (1 - alpha)
        out.append(cur)
    return out


def calculate_macd(closes, fast=12, slow=26, signal=9):
    ef, es = ewma(closes, fast), ewma(closes, slow)
    line = [a - b for a, b in zip(ef, es)]
    sig = ewma(line, signal)
    hist = [a - b for a, b in zip(line, sig)]
    return line, sig, hist


def calculate_rsi(closes, window=14):
    gain, loss = [], []
    for i in range(1, len(closes)):
        d = closes[i] - closes[i - 1]
        gain.append(d if d > 0 else 0)
        loss.append(-d if d < 0 else 0)
    ag, al = sma(gain, window), sma(loss, window)
    rsi = [None]
    for g, l in zip(ag, al):
        if l == 0:
            rsi.append(100)
        elif l is None:
            rsi.append(None)
        else:
            rsi.append(100 - 100 / (1 + g / l))
    return rsi


def calculate_kd(highs, lows, closes, n=9, m1=3, m2=3):
    rsv = []
    for i in range(len(closes)):
        if i < n - 1:
            rsv.append(50)
        else:
            hi = max(highs[i - n + 1:i + 1])
            lo = min(lows[i - n + 1:i + 1])
            diff = hi - lo or 1e-9
            rsv.append((closes[i] - lo) / diff * 100)
    k = ewma(rsv, 2 * (m1 - 1) + 1)
    d = ewma(k, 2 * (m2 - 1) + 1)
    return k, d


def calculate_bollinger(closes, window=20, num_std=2):
    mid = sma(closes, window)
    up, lo = [], []
    for i in range(len(closes)):
        if i < window - 1:
            up.append(None)
            lo.append(None)
        else:
            sl = closes[i - window + 1:i + 1]
            m = mid[i]
            std = math.sqrt(sum((v - m) ** 2 for v in sl) / (window - 1))
            up.append(m + num_std * std)
            lo.append(m - num_std * std)
    return up, mid, lo


# ── 轉折點 ──────────────────────────────────────────────────────
def find_pivots(highs, lows, k=5):
    out = []
    for i in range(k, len(highs) - k):
        is_h = is_l = True
        for j in range(i - k, i + k + 1):
            if j == i:
                continue
            if (highs[j] >= highs[i]) if j < i else (highs[j] > highs[i]):
                is_h = False
            if (lows[j] <= lows[i]) if j < i else (lows[j] < lows[i]):
                is_l = False
        if is_h:
            out.append({"i": i, "type": "H", "price": highs[i]})
        if is_l:
            out.append({"i": i, "type": "L", "price": lows[i]})
    return out


def _series_pivots(s, k=3):
    out = []
    for i in range(k, len(s) - k):
        if s[i] is None:
            continue
        hi = lo = True
        for j in range(i - k, i + k + 1):
            if j == i or s[j] is None:
                continue
            if (s[j] >= s[i]) if j < i else (s[j] > s[i]):
                hi = False
            if (s[j] <= s[i]) if j < i else (s[j] < s[i]):
                lo = False
        if hi:
            out.append({"i": i, "type": "H", "v": s[i]})
        if lo:
            out.append({"i": i, "type": "L", "v": s[i]})
    return out


# ── 1. 主要趨勢與波峰波谷 ───────────────────────────────────────
def _trend(bars, closes, pivots):
    n = len(closes)
    close = closes[-1]
    long_win = 200 if n >= 210 else 100 if n >= 110 else 60 if n >= 70 else None
    out = {"stance": NA, "lines": [], "longWin": long_win, "primary": None}
    if not long_win:
        out["lines"].append("K 線不足 70 根，無法判斷主要趨勢")
        return out
    ma = sma(closes, long_win)
    ma_now, ma_prev = ma[-1], ma[n - 21]
    slope_up = ma_prev is not None and ma_now > ma_prev
    out["longMa"] = _r2(ma_now)
    primary = "bull" if close > ma_now and slope_up else "bear" if close < ma_now and not slope_up else "range"
    out["primary"] = primary
    label = "200 日線（約 40 週線）" if long_win == 200 else f"{long_win} 日線（資料不足 200 日，暫代長期均線）"
    out["lines"].append(
        f"{label} {_f(ma_now)}，斜率{'向上' if slope_up else '向下'}；"
        + ("價格在其上，主要趨勢偏牛市" if primary == "bull" else "價格在其下，主要趨勢偏熊市" if primary == "bear" else "價格與均線方向不一致，趨勢未明"))

    highs = [p for p in pivots if p["type"] == "H"][-2:]
    lows = [p for p in pivots if p["type"] == "L"][-2:]
    swing = "unknown"
    if len(highs) == 2 and len(lows) == 2:
        hh = highs[1]["price"] > highs[0]["price"]
        hl = lows[1]["price"] > lows[0]["price"]
        swing = "up" if hh and hl else "down" if (not hh and not hl) else "mixed"
        out["lines"].append(
            "波峰與波谷持續墊高（上升趨勢結構）" if swing == "up"
            else "波峰與波谷持續降低（下降趨勢結構）" if swing == "down"
            else f"波峰{'墊高' if hh else '降低'}、波谷{'墊高' if hl else '降低'}，結構轉換中")
        last_low, last_high = lows[-1]["price"], highs[-1]["price"]
        if not hh and hl and close < last_low:
            swing = "top-reversal"
            out["lines"].append(f"出現較低波峰後收盤跌破前波谷 {_f(last_low)}，普林格定義的頂部反轉確認")
        if hl and not hh and close > last_high:
            swing = "bottom-reversal"
            out["lines"].append(f"出現較高波谷後收盤突破前波峰 {_f(last_high)}，普林格定義的底部反轉確認")
    else:
        out["lines"].append("波段高低點不足，無法判斷波峰波谷結構")
    out["swing"] = swing
    b = (1 if primary == "bull" else -1 if primary == "bear" else 0) \
        + (1 if swing in ("up", "bottom-reversal") else -1 if swing in ("down", "top-reversal") else 0)
    out["stance"] = BULL if b > 0 else BEAR if b < 0 else NEUTRAL
    return out


# ── 2. 支撐與阻力 ───────────────────────────────────────────────
def _support_resistance(bars, closes, pivots):
    close = closes[-1]
    n = len(closes)
    recent = [p for p in pivots if p["i"] >= n - 120]
    zones = []
    for p in sorted(recent, key=lambda x: x["price"]):
        z = next((z for z in zones if abs(_pct(p["price"], z["center"])) <= 2), None)
        if z:
            z["members"].append(p)
            z["center"] = sum(m["price"] for m in z["members"]) / len(z["members"])
        else:
            zones.append({"center": p["price"], "members": [p]})
    for z in zones:
        ms = z["members"]
        z["touches"] = len(ms)
        z["lo"] = min(m["price"] for m in ms)
        z["hi"] = max(m["price"] for m in ms)
        z["flipped"] = any(m["type"] == "H" for m in ms) and any(m["type"] == "L" for m in ms)
    sup = sorted([z for z in zones if z["hi"] < close * 0.995], key=lambda z: -z["center"])
    res = sorted([z for z in zones if z["lo"] > close * 1.005], key=lambda z: z["center"])
    support = sup[0] if sup else None
    resistance = res[0] if res else None

    out = {"stance": NEUTRAL, "lines": [], "support": None, "resistance": None}

    def desc(z):
        rng = f"{_f(z['lo'])}" + (f"~{_f(z['hi'])}" if z["hi"] != z["lo"] else "")
        return f"{rng}（碰觸 {z['touches']} 次{'，曾角色互換' if z['flipped'] else ''}）"

    if support:
        out["support"] = {"lo": _r2(support["lo"]), "hi": _r2(support["hi"]), "touches": support["touches"], "flipped": support["flipped"]}
        out["lines"].append(f"下方最近支撐區 {desc(support)}，距現價 {_f(_pct(close, support['hi']))}%")
    else:
        out["lines"].append("近 120 日下方沒有明確支撐區（可能位於新低區）")
    if resistance:
        out["resistance"] = {"lo": _r2(resistance["lo"]), "hi": _r2(resistance["hi"]), "touches": resistance["touches"], "flipped": resistance["flipped"]}
        out["lines"].append(f"上方最近阻力區 {desc(resistance)}，距現價 {_f(_pct(resistance['lo'], close))}%")
    else:
        out["lines"].append("近 120 日上方沒有明確阻力區（可能位於新高區）")

    d_s = _pct(close, support["hi"]) if support else math.inf
    d_r = _pct(resistance["lo"], close) if resistance else math.inf
    if d_s <= 3 and d_s < d_r:
        out["stance"] = BULL
    elif d_r <= 3 and d_r < d_s:
        out["stance"] = BEAR
    return out


# ── 3. 均線、3% 原則與突破 ─────────────────────────────────────
def _ma_breakout(bars, closes, highs, lows, vols):
    n = len(closes)
    close = closes[-1]
    out = {"stance": NEUTRAL, "lines": [], "breakout": None}
    score = 0
    ma10, ma25, ma50 = sma(closes, 10), sma(closes, 25), sma(closes, 50)
    if n >= 30:
        above = ma10[-1] > ma25[-1]
        cross_ago = None
        k = 1
        while k <= 5 and n - 1 - k >= 25:
            if (ma10[n - 1 - k] > ma25[n - 1 - k]) != above:
                cross_ago = k
                break
            k += 1
        out["lines"].append(f"10 日線在 25 日線{'之上' if above else '之下'}"
                            + (f"，{cross_ago} 日內剛{'黃金' if above else '死亡'}交叉" if cross_ago else ""))
        score += 1 if above else -1

    if n >= 50:
        d = _pct(close, ma50[-1])
        out["lines"].append(
            f"收盤高於 50 日線 {_f(d)}%，符合 3% 有效站上" if d >= 3
            else f"收盤低於 50 日線 {_f(-d)}%，符合 3% 有效跌破" if d <= -3
            else f"收盤距 50 日線 {_f(d)}%，在 ±3% 拉鋸區，均線訊號不可靠")
        score += 1 if d >= 3 else -1 if d <= -3 else 0
        mas = [ma10[-1], ma25[-1], ma50[-1]]
        spread = (max(mas) - min(mas)) / close * 100
        if spread < 2:
            out["lines"].append(f"10/25/50 日線糾結在 {_f(spread)}% 內，普林格視為蓄勢，等待放量突破方向")

    if n >= 60:
        up, mid, lo = calculate_bollinger(closes, 20, 2)
        bw = [None if u is None else (u - l) / m for u, l, m in zip(up, lo, mid)]
        hist = [v for v in bw[-120:] if v is not None]
        now_bw = bw[-1]
        if hist and sum(1 for v in hist if v < now_bw) / len(hist) <= 0.1:
            out["lines"].append(f"布林帶寬處於近 {len(hist)} 日最窄的 10%，波動收斂，易出現單邊突破")

    if n >= 61:
        vol20 = sma(vols, 20)
        avg_vol = vol20[n - 2] or 0
        prev_high = max(highs[n - 61:n - 1])
        prev_low = min(lows[n - 61:n - 1])
        vol_ratio = vols[-1] / avg_vol if avg_vol > 0 else None
        if close >= prev_high * 1.03:
            vol_ok = vol_ratio is not None and vol_ratio >= 1.5
            out["breakout"] = "up-confirmed" if vol_ok else "up-no-volume"
            out["lines"].append(f"收盤突破前 60 日高點 {_f(prev_high)} 達 3% 以上，"
                                + (f"量比 {_f(vol_ratio)} 放量，有效突破" if vol_ok else f"但量比僅 {_f(vol_ratio)}，無量向上突破易為假突破"))
            score += 2 if vol_ok else 0
        elif close > prev_high:
            out["breakout"] = "up-unconfirmed"
            out["lines"].append(f"收盤站上前 60 日高點 {_f(prev_high)}，但幅度未達 3%，突破尚未確認")
        elif close <= prev_low * 0.97:
            out["breakout"] = "down-confirmed"
            out["lines"].append(f"收盤跌破前 60 日低點 {_f(prev_low)} 達 3% 以上，向下跌破不需放量即有效")
            score -= 2

        if not out["breakout"]:
            for j in range(n - 11, n - 1):
                if j < 61:
                    continue
                lvl_h = max(highs[j - 60:j])
                lvl_l = min(lows[j - 60:j])
                if closes[j] > lvl_h and close < lvl_h * 0.99:
                    out["breakout"] = "failed-up"
                    out["lines"].append(f"{bars[j]['date']} 曾收在前高 {_f(lvl_h)} 之上，現已跌回，屬假突破（失敗形態），普林格視為反向警訊")
                    score -= 2
                    break
                if closes[j] < lvl_l and close > lvl_l * 1.01:
                    out["breakout"] = "failed-down"
                    out["lines"].append(f"{bars[j]['date']} 曾收在前低 {_f(lvl_l)} 之下，現已站回，屬假跌破，普林格視為反向的多方訊號")
                    score += 2
                    break

    out["stance"] = BULL if score >= 2 else BEAR if score <= -2 else NEUTRAL
    return out


# ── 4. 動能 ─────────────────────────────────────────────────────
def _momentum(closes, highs, lows, pivots, primary):
    n = len(closes)
    out = {"stance": NEUTRAL, "lines": []}
    if n < 40:
        out["stance"] = NA
        out["lines"].append("K 線不足，無法計算動能指標")
        return out
    score = 0
    rsi = calculate_rsi(closes, 14)
    r_now = rsi[-1]
    if r_now is not None:
        t = f"RSI(14) {_f(r_now)}"
        if primary == "bull" and r_now >= 70:
            t += "，牛市中的超買屬強勢鈍化，不宜視為賣訊"
        elif primary == "bull" and r_now <= 40:
            t += "，牛市中回落到低檔，普林格視為相對低風險區"
            score += 1
        elif primary == "bear" and r_now <= 30:
            t += "，熊市中的超賣會長期鈍化，不宜視為買訊"
        elif primary == "bear" and r_now >= 60:
            t += "，熊市反彈觸及高檔，普林格視為反彈壓力區"
            score -= 1
        elif r_now >= 70:
            t += "，超買"
        elif r_now <= 30:
            t += "，超賣"
        out["lines"].append(t)

    ph = [p for p in pivots if p["type"] == "H" and p["i"] >= n - 80][-2:]
    pl = [p for p in pivots if p["type"] == "L" and p["i"] >= n - 80][-2:]
    if len(ph) == 2 and rsi[ph[0]["i"]] is not None and ph[1]["price"] > ph[0]["price"] and rsi[ph[1]["i"]] < rsi[ph[0]["i"]] - 2:
        out["lines"].append(f"價格波峰墊高但 RSI 波峰降低（{_f(rsi[ph[0]['i']])}→{_f(rsi[ph[1]['i']])}），負背離警訊，需等價格跌破支撐確認")
        score -= 1
    if len(pl) == 2 and rsi[pl[0]["i"]] is not None and pl[1]["price"] < pl[0]["price"] and rsi[pl[1]["i"]] > rsi[pl[0]["i"]] + 2:
        out["lines"].append(f"價格波谷降低但 RSI 波谷墊高（{_f(rsi[pl[0]['i']])}→{_f(rsi[pl[1]['i']])}），正背離，需等價格突破阻力確認")
        score += 1

    rp = [p for p in _series_pivots(rsi, 3) if p["i"] >= n - 40]
    for a in range(len(rp) - 3, -1, -1):
        A, B, C = rp[a], rp[a + 1], rp[a + 2]
        if A["type"] == "H" and B["type"] == "L" and C["type"] == "H" and A["v"] >= 70 and C["v"] < A["v"] and r_now < B["v"]:
            out["lines"].append(f"RSI 頂部失敗擺動：{_f(A['v'])} 的高點後反彈未創高（{_f(C['v'])}），且已跌破中間低點 {_f(B['v'])}")
            score -= 2
            break
        if A["type"] == "L" and B["type"] == "H" and C["type"] == "L" and A["v"] <= 30 and C["v"] > A["v"] and r_now > B["v"]:
            out["lines"].append(f"RSI 底部失敗擺動：{_f(A['v'])} 的低點後回落未創低（{_f(C['v'])}），且已突破中間高點 {_f(B['v'])}")
            score += 2
            break

    s_line, _, s_hist = calculate_macd(closes, 12, 26, 9)
    f_line, _, f_hist = calculate_macd(closes, 8, 17, 9)

    def crossed(h, k):
        return (h[n - 1 - k] > 0) != (h[n - 2 - k] > 0)

    for k in range(3):
        when = "今日" if k == 0 else f"{k} 日前"
        if crossed(f_hist, k) and f_hist[n - 1 - k] > 0:
            low = f_line[n - 1 - k] < 0
            out["lines"].append(f"MACD(8,17,9) {when}黃金交叉，位置{'在零軸下（低檔，可靠度較高）' if low else '在零軸上'}")
            score += 1 if low else 0
            break
        if crossed(s_hist, k) and s_hist[n - 1 - k] < 0:
            high = s_line[n - 1 - k] > 0
            out["lines"].append(f"MACD(12,26,9) {when}死亡交叉，位置{'在零軸上（高檔，可靠度較高）' if high else '在零軸下'}")
            score -= 1 if high else 0
            break

    K, D = calculate_kd(highs, lows, closes, 9, 3, 3)
    for j in range(3):
        i = n - 1 - j
        up = K[i] > D[i] and K[i - 1] <= D[i - 1]
        dn = K[i] < D[i] and K[i - 1] >= D[i - 1]
        d_up, d_dn = D[i] > D[i - 1], D[i] < D[i - 1]
        if up and min(D[i], D[i - 1], D[i - 2]) <= 20:
            out["lines"].append("KD 低檔（D≤20）黃金交叉" + ("，屬右向交叉（D 已先翻揚），可靠度較高" if d_up else "，但為左向交叉（D 尚未翻揚），可靠度較低"))
            score += 1 if d_up else 0
            break
        if dn and max(D[i], D[i - 1], D[i - 2]) >= 80:
            out["lines"].append("KD 高檔（D≥80）死亡交叉" + ("，屬右向交叉（D 已先下彎），可靠度較高" if d_dn else "，但為左向交叉（D 尚未下彎），可靠度較低"))
            score -= 1 if d_dn else 0
            break

    roc = [_pct(closes[-1], closes[n - 1 - p]) for p in (10, 25, 45) if n > p]
    pos = sum(1 for v in roc if v > 0)
    if len(roc) == 3:
        out["lines"].append(f"ROC 10/25/45 日：{' / '.join(_f(v) + '%' for v in roc)}，"
                            + ("三週期同步為正" if pos == 3 else "三週期同步為負" if pos == 0 else "方向分歧"))
        score += 1 if pos == 3 else -1 if pos == 0 else 0

    out["stance"] = BULL if score >= 2 else BEAR if score <= -2 else NEUTRAL
    return out


# ── 5. 量價 ─────────────────────────────────────────────────────
def _volume(bars, closes, vols, pivots):
    n = len(closes)
    out = {"stance": NEUTRAL, "lines": []}
    if n < 30:
        out["stance"] = NA
        out["lines"].append("K 線不足，無法判斷量價關係")
        return out
    score = 0
    up_v = up_n = dn_v = dn_n = 0
    for i in range(n - 20, n):
        if closes[i] > closes[i - 1]:
            up_v += vols[i]
            up_n += 1
        elif closes[i] < closes[i - 1]:
            dn_v += vols[i]
            dn_n += 1
    if up_n and dn_n:
        ratio = (up_v / up_n) / (dn_v / dn_n) if dn_v > 0 else math.inf
        out["lines"].append(f"近 20 日上漲日均量 / 下跌日均量 = {_f(ratio)}，"
                            + ("價漲量增、價跌量縮，量價健康" if ratio >= 1.2 else "下跌日量大於上漲日，賣壓較重" if ratio <= 0.8 else "量價關係中性"))
        score += 1 if ratio >= 1.2 else -1 if ratio <= 0.8 else 0

    def vol_around(i):
        s = vols[max(0, i - 2):i + 3]
        return sum(s) / len(s)

    ph = [p for p in pivots if p["type"] == "H" and p["i"] >= n - 80][-2:]
    if len(ph) == 2 and ph[1]["price"] > ph[0]["price"] and vol_around(ph[1]["i"]) < vol_around(ph[0]["i"]) * 0.8:
        out["lines"].append("價格波峰墊高但對應成交量萎縮逾兩成，價漲量縮，追價買盤轉弱")
        score -= 1
    pl = [p for p in pivots if p["type"] == "L" and p["i"] >= n - 80][-2:]
    if len(pl) == 2 and abs(_pct(pl[1]["price"], pl[0]["price"])) <= 3 and vol_around(pl[1]["i"]) < vol_around(pl[0]["i"]) * 0.8:
        out["lines"].append("二次回測前低時成交量明顯萎縮，賣壓竭盡，支撐可信度提高")
        score += 1

    vol50 = sma(vols, 50)
    if n >= 70:
        base = vol50[n - 6]
        chg60 = _pct(closes[n - 6], closes[n - 66 if n - 66 >= 0 else 0])
        for i in range(n - 5, n):
            if base and vols[i] >= base * 3:
                if chg60 >= 20:
                    out["lines"].append(f"{bars[i]['date']} 長期上漲後爆出 {_f(vols[i] / base)} 倍均量，留意購買高潮（頂部訊號）")
                    score -= 1
                elif chg60 <= -20:
                    out["lines"].append(f"{bars[i]['date']} 長期下跌後爆出 {_f(vols[i] / base)} 倍均量，可能是賣出高潮（恐慌宣洩）")
                    score += 1
                else:
                    out["lines"].append(f"{bars[i]['date']} 爆出 {_f(vols[i] / base)} 倍均量")
                break

    vol20 = sma(vols, 20)
    avg20 = vol20[n - 2]
    chg = _pct(closes[-1], closes[n - 2])
    if avg20 and vols[-1] >= avg20 * 2 and chg < 0.5 and _pct(closes[-1], closes[max(0, n - 21)]) > 5:
        out["lines"].append(f"今日量能達 20 日均量 {_f(vols[-1] / avg20)} 倍但價格{'下跌' if chg < 0 else '停滯'}（{_f(chg)}%），放量滯漲屬出貨警訊")
        score -= 1

    out["stance"] = BULL if score >= 1 else BEAR if score <= -1 else NEUTRAL
    return out


# ── 6. 停損與盈虧比 ─────────────────────────────────────────────
def _risk(closes, pivots, sr):
    close = closes[-1]
    out = {"stance": NEUTRAL, "lines": [], "stop": None, "target": None, "rr": None}
    lows = [p for p in pivots if p["type"] == "L"]
    base = sr["support"]["lo"] if sr["support"] else (lows[-1]["price"] if lows else None)
    if base is None or base >= close:
        out["stance"] = NA
        out["lines"].append("找不到現價下方的支撐或波谷，無法設定參考停損")
        return out
    out["stop"] = _r2(base * 0.98)
    risk = close - out["stop"]
    out["lines"].append(f"參考停損 {_s(out['stop'])}（支撐 {_f(base)} 下方 2% 緩衝），風險 {_f(risk / close * 100)}%")
    if sr["resistance"]:
        out["target"] = sr["resistance"]["lo"]
        out["rr"] = _r2((out["target"] - close) / risk)
        out["lines"].append(f"上方阻力 {_s(out['target'])}，潛在空間 {_f((out['target'] - close) / close * 100)}%，盈虧比約 {_s(out['rr'])} : 1")
        out["stance"] = BULL if out["rr"] >= 2 else BEAR if out["rr"] < 1 else NEUTRAL
        if out["rr"] < 1:
            out["lines"].append("盈虧比低於 1，普林格建議等待回測支撐或突破後回抽再評估")
    else:
        out["lines"].append("上方無明確阻力，改以波谷墊高的追蹤停損保護")
    return out


def evaluate_pring(chart_data):
    """主入口，回傳結構與 JS 版 evaluatePring 相同；K 線不足 30 根回傳 None。"""
    bars = [b for b in (chart_data or [])
            if b and isinstance(b.get("close"), (int, float)) and math.isfinite(b["close"]) and b["close"] > 0]
    if len(bars) < 30:
        return None
    closes = [float(b["close"]) for b in bars]
    highs = [float(b.get("high") or b["close"]) for b in bars]
    lows = [float(b.get("low") or b["close"]) for b in bars]
    vols = [float(b.get("volume") or 0) for b in bars]
    pivots = find_pivots(highs, lows, 5)

    trend = _trend(bars, closes, pivots)
    sr = _support_resistance(bars, closes, pivots)
    ma = _ma_breakout(bars, closes, highs, lows, vols)
    mom = _momentum(closes, highs, lows, pivots, trend["primary"])
    vol = _volume(bars, closes, vols, pivots)
    risk = _risk(closes, pivots, sr)

    items = [
        {"key": "trend", "title": "1. 主要趨勢與波峰波谷", **trend},
        {"key": "sr", "title": "2. 支撐與阻力", **sr},
        {"key": "ma", "title": "3. 均線、3% 原則與突破", **ma},
        {"key": "momentum", "title": "4. 動能指標（僅為警訊）", **mom},
        {"key": "volume", "title": "5. 量價關係", **vol},
        {"key": "risk", "title": "6. 停損與盈虧比", **risk},
    ]
    core = [it for it in items[:5] if it["stance"] != NA]
    bull = sum(1 for it in core if it["stance"] == BULL)
    bear = sum(1 for it in core if it["stance"] == BEAR)
    price_stance = [trend["stance"], ma["stance"]]
    if bull >= 3 and BEAR not in price_stance:
        overall = BULL
    elif bear >= 3 and BULL not in price_stance:
        overall = BEAR
    else:
        overall = NEUTRAL
    overall_text = f"{len(core)} 項中偏多 {bull}、偏空 {bear}，" + (
        "多方訊號共振" if overall == BULL else "空方訊號共振" if overall == BEAR else "訊號未形成共振，普林格建議等待更多證據")

    pivot_text = "、".join(f"{bars[p['i']]['date']}{'波峰' if p['type'] == 'H' else '波谷'}{_f(p['price'])}" for p in pivots[-8:])
    summary = "\n".join(f"{it['title']}【{STANCE_LABEL[it['stance']]}】{'；'.join(it['lines'])}" for it in items) \
        + f"\n總結：{overall_text}" + (f"\n近期波段高低點（左右各 5 日確認）：{pivot_text}" if pivot_text else "")

    return {
        "items": items,
        "overall": overall,
        "overallText": overall_text,
        "bull": bull,
        "bear": bear,
        "bars": len(bars),
        "pivots": [{"date": bars[p["i"]]["date"], "type": p["type"], "price": _r2(p["price"])} for p in pivots[-8:]],
        "summary": summary,
    }
