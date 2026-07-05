"""
NVIDIA NIM（build.nvidia.com 免費 API）敘述層。

重要原則：分數與訊號一律由 analyzer.py 的固定規則引擎算出，這裡的 LLM
「絕對不」重新計算分數或給買賣建議，只負責把已經算好的數字/訊號翻譯成
一兩句白話中文說明。任何呼叫失敗（沒有金鑰、逾時、免費額度用盡等）都
安靜地回傳 None，絕不讓 AI 服務的可用性影響原本的推薦資料同步。
"""
import os
import requests
from concurrent.futures import ThreadPoolExecutor

NVIDIA_API_KEY = os.environ.get("NVIDIA_API_KEY")
NVIDIA_API_URL = "https://integrate.api.nvidia.com/v1/chat/completions"
# 預設用小型、低延遲模型，免費額度（通常每分鐘數十次請求）才夠用；
# 可用 NVIDIA_MODEL 環境變數覆蓋成 build.nvidia.com 上的其他模型代號。
NVIDIA_MODEL = os.environ.get("NVIDIA_MODEL", "meta/llama-3.1-8b-instruct")

SYSTEM_PROMPT = (
    "你是台股量化系統的簡評助手。系統已經用固定規則算好分數與訊號，"
    "你的唯一工作是把這些「已經算好的數字」用一到兩句繁體中文口語講清楚，"
    "說明系統為什麼認為這檔股票值得留意、以及需要留意的風險。"
    "不要自己編造分數、價位或任何系統未提供的數據，不要做出買賣建議或"
    "保證獲利的字眼，只針對既有訊號做白話解讀。字數控制在 70 字以內，"
    "直接輸出說明文字，不要加開場白或引號。"
)

ANALYSIS_SYSTEM_PROMPT = (
    "你是台股量化系統的個股分析助手。系統已經用固定規則算好所有分數、"
    "技術指標與訊號，你的唯一工作是把這些「已經算好的數據」整合成一段"
    "3 到 5 句的繁體中文綜合解讀，幫使用者快速看懂系統在說什麼。"
    "你可以綜合技術面（均線/KD/RSI/MACD/量能）、籌碼面診斷、CDP 區間、"
    "基本面（本益比/殖利率/ROE）等資訊，指出多空訊號是否一致、有沒有互相"
    "矛盾的地方、以及主要風險。絕對不要自己編造任何分數、價位或數據，"
    "不要給出買賣建議、目標價或保證獲利的字眼，只針對系統已提供的資訊做"
    "客觀解讀。字數控制在 200 字以內，直接輸出說明文字，不要加開場白、"
    "不要加項目符號、不要加引號。"
)


def _call_nvidia(system_prompt, user_prompt, max_tokens=150, temperature=0.4):
    """共用的 NVIDIA NIM 呼叫邏輯。沒有金鑰或任何失敗都安靜回傳 None。"""
    if not NVIDIA_API_KEY:
        return None
    try:
        resp = requests.post(
            NVIDIA_API_URL,
            headers={"Authorization": f"Bearer {NVIDIA_API_KEY}"},
            json={
                "model": NVIDIA_MODEL,
                "messages": [
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt},
                ],
                "temperature": temperature,
                "max_tokens": max_tokens,
            },
            timeout=15,
        )
        if resp.status_code != 200:
            return None
        text = resp.json()["choices"][0]["message"]["content"].strip()
        return text or None
    except Exception:
        return None


def generate_commentary(stock_name, stock_id, score, status, signals, price=None, change_pct=None):
    """呼叫 NVIDIA NIM，將已算好的分數/訊號整理成一句話評論。失敗回傳 None。"""
    signal_text = "、".join(signals[:5]) if signals else "無特別訊號"
    user_prompt = (
        f"股票：{stock_name}（{stock_id}）\n"
        f"目前股價：{price if price is not None else '未知'}"
        f"（漲跌 {change_pct if change_pct is not None else '未知'}%）\n"
        f"系統評分：{score} 分\n"
        f"系統狀態標籤：{status or '無'}\n"
        f"系統偵測到的訊號：{signal_text}\n"
        f"請用一到兩句話白話解讀以上「已經算好」的資訊。"
    )
    return _call_nvidia(SYSTEM_PROMPT, user_prompt, max_tokens=150)


def generate_stock_analysis_commentary(payload):
    """個股分析頁專用：綜合技術面/籌碼面/基本面/CDP 等已算好的資料，
    產出一段 3~5 句的整體解讀。payload 是前端已經算好的分析結果節錄。
    失敗（無金鑰、逾時等）安靜回傳 None。"""
    if not NVIDIA_API_KEY:
        return None

    def g(key, default='未知'):
        v = payload.get(key)
        return default if v is None or v == '' else v

    diagnosis = payload.get('diagnosis') or []
    volume_patterns = payload.get('volume_patterns') or []
    cdp = payload.get('cdp') or {}

    lines = [
        f"股票：{g('stock_name')}（{g('stock_id')}）",
        f"目前股價：{g('price')}（漲跌 {g('change_percent')}%），分類：{g('category')}",
        f"系統綜合評分：{g('total_score')} 分，狀態標籤：{g('recommend_status', '無')}",
        f"技術指標：KD {g('kd')}、RSI {g('rsi')}、MACD {g('macd')}、"
        f"5日均線 {g('ma5')}、20日均線 {g('ma20')}、60日均線 {g('ma60')}、"
        f"量比 {g('vol_ratio')}、年化波動率 {g('volatility')}%",
        f"基本面：本益比 {g('pe')}、殖利率 {g('yield')}%、ROE {g('roe')}%、負債比 {g('debt_ratio')}%",
    ]
    if diagnosis:
        lines.append("系統診斷訊號：" + "；".join(str(d) for d in diagnosis[:8]))
    if volume_patterns:
        lines.append("成交量形態：" + "、".join(str(v) for v in volume_patterns[:5]))
    if cdp.get('CDP') is not None:
        lines.append(
            f"CDP 區間：AH {cdp.get('AH')} / NH {cdp.get('NH')} / "
            f"CDP {cdp.get('CDP')} / NL {cdp.get('NL')} / AL {cdp.get('AL')}"
        )
    if g('strategy_name', None):
        lines.append(
            f"系統建議策略：{g('strategy_name')}，進場價位 {g('entry_range')}，"
            f"停損價位 {g('stop_loss')}，出場鐵律：{g('exit_rule')}"
        )

    lines.append("請將以上「已經算好」的資訊整合成一段 3~5 句的繁體中文綜合解讀。")
    user_prompt = "\n".join(lines)

    return _call_nvidia(ANALYSIS_SYSTEM_PROMPT, user_prompt, max_tokens=350)


INTEGRATED_SYSTEM_PROMPT = (
    "你是台股量化系統的個股整合分析助手。系統已經用固定規則算好所有分數、"
    "技術指標與訊號，前端也整理好了籌碼、分點、基本面與新聞的節錄資料。"
    "你的工作是把這些「已經算好/整理好」的資訊，整合成一份分段式的繁體中文報告，"
    "格式嚴格如下（每段以【標題】起頭獨立一行，之後接該段內文 2~4 句）：\n"
    "【技術面】...\n【籌碼面】...\n【分點動向】...\n【基本面】...\n【消息面】...\n【整體結論】...\n"
    "【技術面】請結合提供的日 K 走勢資料（每日開高低收與量能、近期高低點位置）"
    "描述價格型態與趨勢，例如是否創高/破低、上下影線、量價配合情況。"
    "若某一面向的資料標示為「無資料」，該段就寫一句說明資料不足即可。"
    "在【整體結論】中指出各面向訊號是否一致、有無矛盾、以及主要風險。"
    "絕對不要自己編造任何分數、價位或數據，不要給出買賣建議、目標價或"
    "保證獲利的字眼，只針對系統已提供的資訊做客觀解讀。"
    "直接輸出報告內容，不要加開場白、不要加引號、不要用 markdown 符號。"
)


def _fmt_num(v):
    return '未知' if v is None or v == '' else v


def generate_integrated_analysis(payload):
    """AI 整合分析分頁專用：把技術/籌碼/分點/基本面/新聞五個面向的節錄
    整合成一份分段報告。payload 由前端整理，失敗安靜回傳 None。"""
    if not NVIDIA_API_KEY:
        return None

    g = lambda k, d='未知': _fmt_num(payload.get(k)) if payload.get(k) not in (None, '') else d

    lines = [
        f"股票：{g('stock_name')}（{g('stock_id')}），分類：{g('category')}",
        f"目前股價：{g('price')}（漲跌 {g('change_percent')}%），系統綜合評分：{g('total_score')} 分，"
        f"狀態標籤：{g('recommend_status', '無')}",
        "",
        "== 技術面 ==",
        f"KD {g('kd')}、RSI {g('rsi')}、MACD {g('macd')}、"
        f"5日均線 {g('ma5')}、20日均線 {g('ma20')}、60日均線 {g('ma60')}、"
        f"量比 {g('vol_ratio')}、年化波動率 {g('volatility')}%",
    ]
    if payload.get('diagnosis'):
        lines.append("系統診斷：" + "；".join(str(d) for d in payload['diagnosis'][:8]))
    if payload.get('volume_patterns'):
        lines.append("成交量形態：" + "、".join(str(v) for v in payload['volume_patterns'][:5]))

    lines.append("")
    lines.append("== 日 K 走勢（近 20 個交易日，含近 60 日高低點）==")
    lines.append(payload.get('kline_summary') or "無資料")

    lines.append("")
    lines.append("== 籌碼面（近 5 個交易日）==")
    lines.append(payload.get('chip_summary') or "無資料")

    lines.append("")
    lines.append("== 分點動向（最新交易日主力進出）==")
    lines.append(payload.get('branch_summary') or "無資料")

    lines.append("")
    lines.append("== 基本面 ==")
    lines.append(
        f"本益比 {g('pe')}、殖利率 {g('yield')}%、ROE {g('roe')}%、負債比 {g('debt_ratio')}%"
    )
    lines.append(payload.get('fundamental_summary') or "無其他財報節錄")

    lines.append("")
    lines.append("== 消息面（近期新聞標題）==")
    news = payload.get('news_titles') or []
    lines.append("；".join(str(t) for t in news[:10]) if news else "無資料")

    lines.append("")
    lines.append("請依指定格式輸出整合分析報告。")

    return _call_nvidia(INTEGRATED_SYSTEM_PROMPT, "\n".join(lines),
                        max_tokens=900, temperature=0.4)


def _extract_score_context(stock):
    """從各策略的巢狀欄位（short_term_rec / overnight / ...）取出分數、狀態、訊號。
    找不到已知子欄位時退回頂層的 total_score / diagnosis。"""
    for key in ('short_term_rec', 'overnight', 'bottom_fishing_rec',
                'short_term_burst_rec', 'day_trade_cdp_rec', 'low_pe_rec'):
        sub = stock.get(key)
        if isinstance(sub, dict) and sub.get('signals'):
            return (
                sub.get('score', stock.get('total_score', 0)),
                sub.get('status', stock.get('recommend_status', '')),
                sub.get('signals', []),
            )
    return (
        stock.get('total_score', 0),
        stock.get('recommend_status', ''),
        stock.get('diagnosis') or [],
    )


def attach_commentary(stock_list, top_n=5, max_workers=3):
    """為清單前 top_n 檔（假設已依分數排序）附加 ai_commentary 欄位。
    沒有設定 NVIDIA_API_KEY 時直接原樣返回，不產生任何額外延遲或錯誤。"""
    if not NVIDIA_API_KEY or not stock_list:
        return stock_list

    targets = stock_list[:top_n]

    def _run(stock):
        score, status, signals = _extract_score_context(stock)
        text = generate_commentary(
            stock.get('stock_name', ''), stock.get('stock_id', ''),
            score, status, signals,
            price=stock.get('price'), change_pct=stock.get('change_percent'),
        )
        if text:
            stock['ai_commentary'] = text
        return stock

    with ThreadPoolExecutor(max_workers=max_workers) as ex:
        list(ex.map(_run, targets))
    return stock_list
