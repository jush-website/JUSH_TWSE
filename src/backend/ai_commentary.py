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


def generate_commentary(stock_name, stock_id, score, status, signals, price=None, change_pct=None):
    """呼叫 NVIDIA NIM，將已算好的分數/訊號整理成一句話評論。失敗回傳 None。"""
    if not NVIDIA_API_KEY:
        return None
    try:
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
        resp = requests.post(
            NVIDIA_API_URL,
            headers={"Authorization": f"Bearer {NVIDIA_API_KEY}"},
            json={
                "model": NVIDIA_MODEL,
                "messages": [
                    {"role": "system", "content": SYSTEM_PROMPT},
                    {"role": "user", "content": user_prompt},
                ],
                "temperature": 0.4,
                "max_tokens": 150,
            },
            timeout=12,
        )
        if resp.status_code != 200:
            return None
        text = resp.json()["choices"][0]["message"]["content"].strip()
        return text or None
    except Exception:
        return None


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
