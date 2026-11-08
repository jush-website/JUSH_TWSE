/**
 * 普林格（Martin Pring《技術分析》）檢核表 —— 只做「規則能客觀算出來」的部分。
 *
 * 書裡的規則分兩類：
 *   1. 可量化：波峰波谷、均線與 3% 穿越原則、支撐阻力區、突破量能、
 *      RSI/MACD/KD/ROC 的超買超賣與背離、成交量原則、停損與盈虧比。→ 這支程式算。
 *   2. 主觀：頭肩頂底、三角形、旗形、趨勢線怎麼畫、K 線形態的「意義」。
 *      → 不在這裡硬算，交給 AI 解讀時參考這裡算好的波段高低點，並標明是推測。
 *
 * 輸入是前端 analyzeStockData() 產生的 chart_data（每筆 open/high/low/close/volume，
 * volume 單位為張）。資料越長越完整：200 日均線要 200 根以上，不足時改用較短的
 * 長天期均線並在結果裡註明，而不是假裝算得出來。
 *
 * 普林格第一鐵律：「我們買賣的是價格，而不是動能指標」。所以動能訊號在這裡只
 * 被標成「警訊」，真正決定趨勢方向的是價格（波峰波谷與均線）。
 */
import { sma, calculateMacd, calculateRsi, calculateKd, calculateBollingerBands } from './indicators.js';

export const STANCE = { BULL: 'bull', BEAR: 'bear', NEUTRAL: 'neutral', NA: 'na' };
export const STANCE_LABEL = { bull: '偏多', bear: '偏空', neutral: '中性', na: '資料不足' };

const r2 = (v) => (v === null || v === undefined || !Number.isFinite(v) ? null : Math.round(v * 100) / 100);
const pct = (a, b) => ((a - b) / b) * 100;
const last = (arr) => arr[arr.length - 1];

/** 波段高低點：左右各 k 根內的最高（最低）點。最後 k 根還沒被「確認」，不列入。 */
export function findPivots(highs, lows, k = 5) {
  const out = [];
  for (let i = k; i < highs.length - k; i++) {
    let isHigh = true, isLow = true;
    // 左側要嚴格低（高）於它，右側允許相等：平台只認第一根，避免整段橫盤每根都算轉折
    for (let j = i - k; j <= i + k; j++) {
      if (j === i) continue;
      if (j < i ? highs[j] >= highs[i] : highs[j] > highs[i]) isHigh = false;
      if (j < i ? lows[j] <= lows[i] : lows[j] < lows[i]) isLow = false;
    }
    if (isHigh) out.push({ i, type: 'H', price: highs[i] });
    if (isLow) out.push({ i, type: 'L', price: lows[i] });
  }
  return out;
}

/** 單一序列（例如 RSI）的轉折點。 */
function seriesPivots(s, k = 3) {
  const out = [];
  for (let i = k; i < s.length - k; i++) {
    if (s[i] === null) continue;
    let hi = true, lo = true;
    for (let j = i - k; j <= i + k; j++) {
      if (j === i || s[j] === null) continue;
      if (j < i ? s[j] >= s[i] : s[j] > s[i]) hi = false;
      if (j < i ? s[j] <= s[i] : s[j] < s[i]) lo = false;
    }
    if (hi) out.push({ i, type: 'H', v: s[i] });
    if (lo) out.push({ i, type: 'L', v: s[i] });
  }
  return out;
}

// ── 第 2 章：主要趨勢與波峰波谷 ─────────────────────────────────
function evaluateTrend(bars, closes, pivots) {
  const n = closes.length;
  const close = last(closes);
  // 長天期均線：普林格以 200 日（≈40 週）代表主要趨勢，資料不足就退一級
  const longWin = n >= 210 ? 200 : n >= 110 ? 100 : n >= 70 ? 60 : null;
  const out = { stance: STANCE.NA, lines: [], longWin, primary: null };
  if (!longWin) { out.lines.push('K 線不足 70 根，無法判斷主要趨勢'); return out; }

  const ma = sma(closes, longWin);
  const maNow = last(ma);
  const maPrev = ma[n - 21];
  const slopeUp = maPrev !== null && maNow > maPrev;
  out.longMa = r2(maNow);
  out.primary = close > maNow && slopeUp ? 'bull' : close < maNow && !slopeUp ? 'bear' : 'range';
  const label = longWin === 200 ? '200 日線（約 40 週線）' : `${longWin} 日線（資料不足 200 日，暫代長期均線）`;
  out.lines.push(`${label} ${r2(maNow)}，斜率${slopeUp ? '向上' : '向下'}；`
    + (out.primary === 'bull' ? '價格在其上，主要趨勢偏牛市' : out.primary === 'bear' ? '價格在其下，主要趨勢偏熊市' : '價格與均線方向不一致，趨勢未明'));

  const highs = pivots.filter(p => p.type === 'H').slice(-2);
  const lows = pivots.filter(p => p.type === 'L').slice(-2);
  let swing = 'unknown';
  if (highs.length === 2 && lows.length === 2) {
    const hh = highs[1].price > highs[0].price, hl = lows[1].price > lows[0].price;
    if (hh && hl) swing = 'up';
    else if (!hh && !hl) swing = 'down';
    else swing = 'mixed';
    out.lines.push(
      swing === 'up' ? '波峰與波谷持續墊高（上升趨勢結構）'
      : swing === 'down' ? '波峰與波谷持續降低（下降趨勢結構）'
      : `波峰${hh ? '墊高' : '降低'}、波谷${hl ? '墊高' : '降低'}，結構轉換中`);

    // 反轉確認：上升趨勢中（波谷仍墊高）先出現「較低波峰」，之後收盤跌破前一波谷；
    // 底部反之。已經是下降結構時再破底只是延續，不算反轉。
    const lastLow = last(lows).price, lastHigh = last(highs).price;
    if (!hh && hl && close < lastLow) { swing = 'top-reversal'; out.lines.push(`出現較低波峰後收盤跌破前波谷 ${r2(lastLow)}，普林格定義的頂部反轉確認`); }
    if (hl && !hh && close > lastHigh) { swing = 'bottom-reversal'; out.lines.push(`出現較高波谷後收盤突破前波峰 ${r2(lastHigh)}，普林格定義的底部反轉確認`); }
  } else {
    out.lines.push('波段高低點不足，無法判斷波峰波谷結構');
  }
  out.swing = swing;

  const bullish = (out.primary === 'bull' ? 1 : out.primary === 'bear' ? -1 : 0)
    + (swing === 'up' || swing === 'bottom-reversal' ? 1 : swing === 'down' || swing === 'top-reversal' ? -1 : 0);
  out.stance = bullish > 0 ? STANCE.BULL : bullish < 0 ? STANCE.BEAR : STANCE.NEUTRAL;
  return out;
}

// ── 第 3 章：支撐與阻力區 ───────────────────────────────────────
function evaluateSupportResistance(bars, closes, pivots) {
  const close = last(closes);
  const n = closes.length;
  const recent = pivots.filter(p => p.i >= n - 120);
  // 把相距 2% 內的高低點合併成一個「區域」；碰觸次數越多、量越大越重要（五大法則 1、3）
  const zones = [];
  for (const p of recent.slice().sort((a, b) => a.price - b.price)) {
    const z = zones.find(z => Math.abs(pct(p.price, z.center)) <= 2);
    if (z) {
      z.members.push(p);
      z.center = z.members.reduce((s, m) => s + m.price, 0) / z.members.length;
    } else zones.push({ center: p.price, members: [p] });
  }
  for (const z of zones) {
    z.touches = z.members.length;
    z.volume = z.members.reduce((s, m) => s + (bars[m.i].volume || 0), 0);
    z.lo = Math.min(...z.members.map(m => m.price));
    z.hi = Math.max(...z.members.map(m => m.price));
    // 角色互換：同一區既當過阻力（波峰）又當過支撐（波谷）
    z.flipped = z.members.some(m => m.type === 'H') && z.members.some(m => m.type === 'L');
  }
  const support = zones.filter(z => z.hi < close * 0.995).sort((a, b) => b.center - a.center)[0] || null;
  const resistance = zones.filter(z => z.lo > close * 1.005).sort((a, b) => a.center - b.center)[0] || null;

  const out = { stance: STANCE.NEUTRAL, lines: [], support: null, resistance: null };
  const desc = (z) => `${r2(z.lo)}${z.hi !== z.lo ? `~${r2(z.hi)}` : ''}（碰觸 ${z.touches} 次${z.flipped ? '，曾角色互換' : ''}）`;
  if (support) {
    out.support = { lo: r2(support.lo), hi: r2(support.hi), touches: support.touches, flipped: support.flipped };
    out.lines.push(`下方最近支撐區 ${desc(support)}，距現價 ${r2(pct(close, support.hi))}%`);
  } else out.lines.push('近 120 日下方沒有明確支撐區（可能位於新低區）');
  if (resistance) {
    out.resistance = { lo: r2(resistance.lo), hi: r2(resistance.hi), touches: resistance.touches, flipped: resistance.flipped };
    out.lines.push(`上方最近阻力區 ${desc(resistance)}，距現價 ${r2(pct(resistance.lo, close))}%`);
  } else out.lines.push('近 120 日上方沒有明確阻力區（可能位於新高區）');

  // 位置判讀：緊靠支撐偏多（風險小）、緊靠阻力偏空
  const dS = support ? pct(close, support.hi) : Infinity;
  const dR = resistance ? pct(resistance.lo, close) : Infinity;
  if (dS <= 3 && dS < dR) out.stance = STANCE.BULL;
  else if (dR <= 3 && dR < dS) out.stance = STANCE.BEAR;
  return out;
}

// ── 第 4、7、12 章：均線、3% 原則、突破與假突破 ─────────────────
function evaluateMaBreakout(bars, closes, highs, lows, vols) {
  const n = closes.length;
  const close = last(closes);
  const out = { stance: STANCE.NEUTRAL, lines: [], breakout: null };
  let score = 0;

  // 雙均線交叉法（書中範例 10 日穿 25 日）
  const ma10 = sma(closes, 10), ma25 = sma(closes, 25), ma50 = sma(closes, 50);
  if (n >= 30) {
    const above = last(ma10) > last(ma25);
    let crossAgo = null;
    for (let k = 1; k <= 5 && n - 1 - k >= 25; k++) {
      if ((ma10[n - 1 - k] > ma25[n - 1 - k]) !== above) { crossAgo = k; break; }
    }
    out.lines.push(`10 日線在 25 日線${above ? '之上' : '之下'}`
      + (crossAgo ? `，${crossAgo} 日內剛${above ? '黃金' : '死亡'}交叉` : ''));
    score += above ? 1 : -1;
  }

  // 3% 穿越原則：以 50 日線（中期）判斷是否「有效」站上 / 跌破
  if (n >= 50) {
    const d = pct(close, last(ma50));
    out.lines.push(d >= 3 ? `收盤高於 50 日線 ${r2(d)}%，符合 3% 有效站上`
      : d <= -3 ? `收盤低於 50 日線 ${r2(-d)}%，符合 3% 有效跌破`
      : `收盤距 50 日線 ${r2(d)}%，在 ±3% 拉鋸區，均線訊號不可靠`);
    score += d >= 3 ? 1 : d <= -3 ? -1 : 0;

    // 規則 5：多條均線糾結（收斂）代表能量蓄積
    const mas = [last(ma10), last(ma25), last(ma50)];
    const spread = (Math.max(...mas) - Math.min(...mas)) / close * 100;
    if (spread < 2) out.lines.push(`10/25/50 日線糾結在 ${r2(spread)}% 內，普林格視為蓄勢，等待放量突破方向`);
  }

  // 布林通道收口（Squeeze）
  if (n >= 60) {
    const bb = calculateBollingerBands(closes, 20, 2);
    const bw = bb.upper.map((u, i) => (u === null ? null : (u - bb.lower[i]) / bb.middle[i]));
    const hist = bw.slice(-120).filter(v => v !== null);
    const nowBw = last(bw);
    const rank = hist.filter(v => v < nowBw).length / hist.length;
    if (rank <= 0.1) out.lines.push(`布林帶寬處於近 ${hist.length} 日最窄的 10%，波動收斂，易出現單邊突破`);
  }

  // 突破：以前 60 日（不含今天）最高 / 最低為界，套用收盤價確認＋ 3% 原則＋量能
  if (n >= 61) {
    const vol20 = sma(vols, 20);
    const avgVol = vol20[n - 2] || 0;
    const prevHigh = Math.max(...highs.slice(n - 61, n - 1));
    const prevLow = Math.min(...lows.slice(n - 61, n - 1));
    const volRatio = avgVol > 0 ? last(vols) / avgVol : null;
    if (close >= prevHigh * 1.03) {
      const volOk = volRatio !== null && volRatio >= 1.5;
      out.breakout = volOk ? 'up-confirmed' : 'up-no-volume';
      out.lines.push(`收盤突破前 60 日高點 ${r2(prevHigh)} 達 3% 以上，`
        + (volOk ? `量比 ${r2(volRatio)} 放量，有效突破` : `但量比僅 ${r2(volRatio)}，無量向上突破易為假突破`));
      score += volOk ? 2 : 0;
    } else if (close > prevHigh) {
      out.breakout = 'up-unconfirmed';
      out.lines.push(`收盤站上前 60 日高點 ${r2(prevHigh)}，但幅度未達 3%，突破尚未確認`);
    } else if (close <= prevLow * 0.97) {
      out.breakout = 'down-confirmed';
      out.lines.push(`收盤跌破前 60 日低點 ${r2(prevLow)} 達 3% 以上，向下跌破不需放量即有效`);
      score -= 2;
    }

    // 假突破：近 10 日曾收在當時前 60 日高點之上，現在又跌回界線下方（反之亦然）
    if (!out.breakout) {
      for (let j = n - 11; j < n - 1; j++) {
        if (j < 61) continue;
        const lvlH = Math.max(...highs.slice(j - 60, j));
        const lvlL = Math.min(...lows.slice(j - 60, j));
        if (closes[j] > lvlH && close < lvlH * 0.99) {
          out.breakout = 'failed-up';
          out.lines.push(`${bars[j].date} 曾收在前高 ${r2(lvlH)} 之上，現已跌回，屬假突破（失敗形態），普林格視為反向警訊`);
          score -= 2; break;
        }
        if (closes[j] < lvlL && close > lvlL * 1.01) {
          out.breakout = 'failed-down';
          out.lines.push(`${bars[j].date} 曾收在前低 ${r2(lvlL)} 之下，現已站回，屬假跌破，普林格視為反向的多方訊號`);
          score += 2; break;
        }
      }
    }
  }

  out.stance = score >= 2 ? STANCE.BULL : score <= -2 ? STANCE.BEAR : STANCE.NEUTRAL;
  return out;
}

// ── 第 8、9 章：動能（只當警訊，需價格確認）────────────────────
function evaluateMomentum(closes, highs, lows, pivots, primary) {
  const n = closes.length;
  const out = { stance: STANCE.NEUTRAL, lines: [] };
  if (n < 40) { out.stance = STANCE.NA; out.lines.push('K 線不足，無法計算動能指標'); return out; }
  let score = 0;

  // RSI：超買超賣要配合主要趨勢解讀（牛熊不對稱）
  const rsi = calculateRsi(closes, 14);
  const rNow = last(rsi);
  if (rNow !== null) {
    let t = `RSI(14) ${r2(rNow)}`;
    if (primary === 'bull' && rNow >= 70) t += '，牛市中的超買屬強勢鈍化，不宜視為賣訊';
    else if (primary === 'bull' && rNow <= 40) { t += '，牛市中回落到低檔，普林格視為相對低風險區'; score += 1; }
    else if (primary === 'bear' && rNow <= 30) t += '，熊市中的超賣會長期鈍化，不宜視為買訊';
    else if (primary === 'bear' && rNow >= 60) { t += '，熊市反彈觸及高檔，普林格視為反彈壓力區'; score -= 1; }
    else if (rNow >= 70) t += '，超買';
    else if (rNow <= 30) t += '，超賣';
    out.lines.push(t);
  }

  // 背離：比較最近兩個價格波峰（波谷）時 RSI 的高低
  const ph = pivots.filter(p => p.type === 'H' && p.i >= n - 80).slice(-2);
  const pl = pivots.filter(p => p.type === 'L' && p.i >= n - 80).slice(-2);
  if (ph.length === 2 && rsi[ph[0].i] !== null && ph[1].price > ph[0].price && rsi[ph[1].i] < rsi[ph[0].i] - 2) {
    out.lines.push(`價格波峰墊高但 RSI 波峰降低（${r2(rsi[ph[0].i])}→${r2(rsi[ph[1].i])}），負背離警訊，需等價格跌破支撐確認`);
    score -= 1;
  }
  if (pl.length === 2 && rsi[pl[0].i] !== null && pl[1].price < pl[0].price && rsi[pl[1].i] > rsi[pl[0].i] + 2) {
    out.lines.push(`價格波谷降低但 RSI 波谷墊高（${r2(rsi[pl[0].i])}→${r2(rsi[pl[1].i])}），正背離，需等價格突破阻力確認`);
    score += 1;
  }

  // RSI 失敗擺動（Failure Swing）：獨立的買賣訊號
  const rp = seriesPivots(rsi, 3).filter(p => p.i >= n - 40);
  for (let a = rp.length - 3; a >= 0; a--) {
    const [A, B, C] = rp.slice(a, a + 3);
    if (!C) continue;
    if (A.type === 'H' && B.type === 'L' && C.type === 'H' && A.v >= 70 && C.v < A.v && rNow < B.v) {
      out.lines.push(`RSI 頂部失敗擺動：${r2(A.v)} 的高點後反彈未創高（${r2(C.v)}），且已跌破中間低點 ${r2(B.v)}`);
      score -= 2; break;
    }
    if (A.type === 'L' && B.type === 'H' && C.type === 'L' && A.v <= 30 && C.v > A.v && rNow > B.v) {
      out.lines.push(`RSI 底部失敗擺動：${r2(A.v)} 的低點後回落未創低（${r2(C.v)}），且已突破中間高點 ${r2(B.v)}`);
      score += 2; break;
    }
  }

  // MACD：交叉不機械操作，只標出位置。買進用阿佩爾建議的靈敏參數 8-17-9。
  const slow = calculateMacd(closes, 12, 26, 9);
  const fast = calculateMacd(closes, 8, 17, 9);
  const crossed = (m, k) => (m.macdHist[n - 1 - k] > 0) !== (m.macdHist[n - 2 - k] > 0);
  for (let k = 0; k < 3; k++) {
    if (crossed(fast, k) && fast.macdHist[n - 1 - k] > 0) {
      out.lines.push(`MACD(8,17,9) ${k === 0 ? '今日' : `${k} 日前`}黃金交叉，位置${fast.macdLine[n - 1 - k] < 0 ? '在零軸下（低檔，可靠度較高）' : '在零軸上'}`);
      score += fast.macdLine[n - 1 - k] < 0 ? 1 : 0; break;
    }
    if (crossed(slow, k) && slow.macdHist[n - 1 - k] < 0) {
      out.lines.push(`MACD(12,26,9) ${k === 0 ? '今日' : `${k} 日前`}死亡交叉，位置${slow.macdLine[n - 1 - k] > 0 ? '在零軸上（高檔，可靠度較高）' : '在零軸下'}`);
      score -= slow.macdLine[n - 1 - k] > 0 ? 1 : 0; break;
    }
  }

  // KD：右向交叉（D 已先轉向，K 才穿越）且發生在超買超賣區，可靠度高
  const { k: K, d: D } = calculateKd(highs, lows, closes, 9, 3, 3);
  for (let j = 0; j < 3; j++) {
    const i = n - 1 - j;
    const up = K[i] > D[i] && K[i - 1] <= D[i - 1];
    const dn = K[i] < D[i] && K[i - 1] >= D[i - 1];
    const dTurnedUp = D[i] > D[i - 1], dTurnedDn = D[i] < D[i - 1];
    if (up && Math.min(D[i], D[i - 1], D[i - 2]) <= 20) {
      out.lines.push(`KD 低檔（D≤20）黃金交叉${dTurnedUp ? '，屬右向交叉（D 已先翻揚），可靠度較高' : '，但為左向交叉（D 尚未翻揚），可靠度較低'}`);
      score += dTurnedUp ? 1 : 0; break;
    }
    if (dn && Math.max(D[i], D[i - 1], D[i - 2]) >= 80) {
      out.lines.push(`KD 高檔（D≥80）死亡交叉${dTurnedDn ? '，屬右向交叉（D 已先下彎），可靠度較高' : '，但為左向交叉（D 尚未下彎），可靠度較低'}`);
      score -= dTurnedDn ? 1 : 0; break;
    }
  }

  // ROC 多週期共振（10/25/45 日）
  const roc = [10, 25, 45].filter(p => n > p).map(p => pct(last(closes), closes[n - 1 - p]));
  const pos = roc.filter(v => v > 0).length;
  if (roc.length === 3) {
    out.lines.push(`ROC 10/25/45 日：${roc.map(v => `${r2(v)}%`).join(' / ')}，${pos === 3 ? '三週期同步為正' : pos === 0 ? '三週期同步為負' : '方向分歧'}`);
    score += pos === 3 ? 1 : pos === 0 ? -1 : 0;
  }

  out.stance = score >= 2 ? STANCE.BULL : score <= -2 ? STANCE.BEAR : STANCE.NEUTRAL;
  return out;
}

// ── 第 10 章：成交量原則 ────────────────────────────────────────
function evaluateVolume(bars, closes, vols, pivots) {
  const n = closes.length;
  const out = { stance: STANCE.NEUTRAL, lines: [] };
  if (n < 30) { out.stance = STANCE.NA; out.lines.push('K 線不足，無法判斷量價關係'); return out; }
  let score = 0;

  // 原則 1：價漲量增、價跌量縮
  let upV = 0, upN = 0, dnV = 0, dnN = 0;
  for (let i = n - 20; i < n; i++) {
    if (closes[i] > closes[i - 1]) { upV += vols[i]; upN++; } else if (closes[i] < closes[i - 1]) { dnV += vols[i]; dnN++; }
  }
  if (upN && dnN) {
    const ratio = (upV / upN) / (dnV / dnN);
    out.lines.push(`近 20 日上漲日均量 / 下跌日均量 = ${r2(ratio)}，`
      + (ratio >= 1.2 ? '價漲量增、價跌量縮，量價健康' : ratio <= 0.8 ? '下跌日量大於上漲日，賣壓較重' : '量價關係中性'));
    score += ratio >= 1.2 ? 1 : ratio <= 0.8 ? -1 : 0;
  }

  const volAround = (i) => {
    const s = vols.slice(Math.max(0, i - 2), i + 3);
    return s.reduce((a, b) => a + b, 0) / s.length;
  };
  // 原則 3：價格創高但量縮
  const ph = pivots.filter(p => p.type === 'H' && p.i >= n - 80).slice(-2);
  if (ph.length === 2 && ph[1].price > ph[0].price && volAround(ph[1].i) < volAround(ph[0].i) * 0.8) {
    out.lines.push('價格波峰墊高但對應成交量萎縮逾兩成，價漲量縮，追價買盤轉弱');
    score -= 1;
  }
  // 原則 7：回測前低時量縮
  const pl = pivots.filter(p => p.type === 'L' && p.i >= n - 80).slice(-2);
  if (pl.length === 2 && Math.abs(pct(pl[1].price, pl[0].price)) <= 3 && volAround(pl[1].i) < volAround(pl[0].i) * 0.8) {
    out.lines.push('二次回測前低時成交量明顯萎縮，賣壓竭盡，支撐可信度提高');
    score += 1;
  }

  // 原則 4/6：購買高潮、賣出高潮（近 5 日出現 3 倍於 50 日均量的爆量）
  const vol50 = sma(vols, 50);
  if (n >= 70) {
    const base = vol50[n - 6];
    const chg60 = pct(closes[n - 6], closes[n - 66 >= 0 ? n - 66 : 0]);
    for (let i = n - 5; i < n; i++) {
      if (base && vols[i] >= base * 3) {
        if (chg60 >= 20) { out.lines.push(`${bars[i].date} 長期上漲後爆出 ${r2(vols[i] / base)} 倍均量，留意購買高潮（頂部訊號）`); score -= 1; }
        else if (chg60 <= -20) { out.lines.push(`${bars[i].date} 長期下跌後爆出 ${r2(vols[i] / base)} 倍均量，可能是賣出高潮（恐慌宣洩）`); score += 1; }
        else out.lines.push(`${bars[i].date} 爆出 ${r2(vols[i] / base)} 倍均量`);
        break;
      }
    }
  }

  // 原則 8：放量滯漲
  const vol20 = sma(vols, 20);
  const avg20 = vol20[n - 2];
  const chg = pct(last(closes), closes[n - 2]);
  if (avg20 && last(vols) >= avg20 * 2 && chg < 0.5 && pct(last(closes), closes[Math.max(0, n - 21)]) > 5) {
    out.lines.push(`今日量能達 20 日均量 ${r2(last(vols) / avg20)} 倍但價格${chg < 0 ? '下跌' : '停滯'}（${r2(chg)}%），放量滯漲屬出貨警訊`);
    score -= 1;
  }

  out.stance = score >= 1 ? STANCE.BULL : score <= -1 ? STANCE.BEAR : STANCE.NEUTRAL;
  return out;
}

// ── 第 12 章：停損位與盈虧比 ────────────────────────────────────
function evaluateRisk(closes, pivots, sr) {
  const close = last(closes);
  const out = { stance: STANCE.NEUTRAL, lines: [], stop: null, target: null, rr: null };
  const lastLow = pivots.filter(p => p.type === 'L').slice(-1)[0];
  const base = sr.support ? sr.support.lo : lastLow ? lastLow.price : null;
  if (base === null || base >= close) { out.stance = STANCE.NA; out.lines.push('找不到現價下方的支撐或波谷，無法設定參考停損'); return out; }
  // 停損設在支撐「略下方」，預留緩衝避免被盤中毛刺洗出場
  out.stop = r2(base * 0.98);
  const risk = close - out.stop;
  out.lines.push(`參考停損 ${out.stop}（支撐 ${r2(base)} 下方 2% 緩衝），風險 ${r2(risk / close * 100)}%`);
  if (sr.resistance) {
    out.target = sr.resistance.lo;
    out.rr = r2((out.target - close) / risk);
    out.lines.push(`上方阻力 ${out.target}，潛在空間 ${r2((out.target - close) / close * 100)}%，盈虧比約 ${out.rr} : 1`);
    out.stance = out.rr >= 2 ? STANCE.BULL : out.rr < 1 ? STANCE.BEAR : STANCE.NEUTRAL;
    if (out.rr < 1) out.lines.push('盈虧比低於 1，普林格建議等待回測支撐或突破後回抽再評估');
  } else {
    out.lines.push('上方無明確阻力，改以波谷墊高的追蹤停損保護');
  }
  return out;
}

/**
 * 主入口。chartData 是 analyzeStockData() 的 chart_data。
 * 回傳 { items:[{key,title,stance,lines}], pivots, overall, summary } 或 null（資料太少）。
 */
export function evaluatePring(chartData) {
  const bars = (chartData || []).filter(b => b && Number.isFinite(b.close) && b.close > 0);
  if (bars.length < 30) return null;
  const closes = bars.map(b => b.close);
  const highs = bars.map(b => b.high || b.close);
  const lows = bars.map(b => b.low || b.close);
  const vols = bars.map(b => b.volume || 0);
  const pivots = findPivots(highs, lows, 5);

  const trend = evaluateTrend(bars, closes, pivots);
  const sr = evaluateSupportResistance(bars, closes, pivots);
  const ma = evaluateMaBreakout(bars, closes, highs, lows, vols);
  const mom = evaluateMomentum(closes, highs, lows, pivots, trend.primary);
  const vol = evaluateVolume(bars, closes, vols, pivots);
  const risk = evaluateRisk(closes, pivots, sr);

  const items = [
    { key: 'trend', title: '1. 主要趨勢與波峰波谷', ...trend },
    { key: 'sr', title: '2. 支撐與阻力', ...sr },
    { key: 'ma', title: '3. 均線、3% 原則與突破', ...ma },
    { key: 'momentum', title: '4. 動能指標（僅為警訊）', ...mom },
    { key: 'volume', title: '5. 量價關係', ...vol },
    { key: 'risk', title: '6. 停損與盈虧比', ...risk },
  ];

  // 共振：前五項多空各幾項。價格面（1、3）優先於動能面（4），符合「買賣的是價格」。
  const core = items.slice(0, 5).filter(it => it.stance !== STANCE.NA);
  const bull = core.filter(it => it.stance === STANCE.BULL).length;
  const bear = core.filter(it => it.stance === STANCE.BEAR).length;
  const priceStance = [trend.stance, ma.stance];
  let overall;
  if (bull >= 3 && !priceStance.includes(STANCE.BEAR)) overall = STANCE.BULL;
  else if (bear >= 3 && !priceStance.includes(STANCE.BULL)) overall = STANCE.BEAR;
  else overall = STANCE.NEUTRAL;
  const overallText = `${core.length} 項中偏多 ${bull}、偏空 ${bear}，`
    + (overall === STANCE.BULL ? '多方訊號共振' : overall === STANCE.BEAR ? '空方訊號共振' : '訊號未形成共振，普林格建議等待更多證據');

  // 給 AI 的波段高低點（讓它推測頭肩、雙重頂底等主觀形態時有依據）
  const pivotText = pivots.slice(-8)
    .map(p => `${bars[p.i].date}${p.type === 'H' ? '波峰' : '波谷'}${r2(p.price)}`).join('、');

  const summary = items.map(it => `${it.title}【${STANCE_LABEL[it.stance]}】${it.lines.join('；')}`).join('\n')
    + `\n總結：${overallText}`
    + (pivotText ? `\n近期波段高低點（左右各 5 日確認）：${pivotText}` : '');

  return {
    items,
    overall,
    overallText,
    bull,
    bear,
    bars: bars.length,
    pivots: pivots.slice(-8).map(p => ({ date: bars[p.i].date, type: p.type, price: r2(p.price) })),
    summary,
  };
}

