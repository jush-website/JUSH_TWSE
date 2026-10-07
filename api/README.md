# api/ — Vercel Functions

這裡只放「沒辦法預先算好」的即時路徑。其他資料都由 GitHub Actions 盤後算好寫進
Firestore，前端直讀（見 `scripts/sync_market_data.py`）。

## 為什麼是 JS 而不是 Python

`pyproject.toml` 裡那個 `api.index:app` 是把整包 FastAPI + pandas + yfinance
搬上 Vercel 的嘗試。那條路有兩個問題：serverless 的 bundle 上限很容易撞到，
而且重依賴的 Python 函式冷啟動還是好幾秒——而「不要再等冷啟動」正是搬過來的
唯一理由。

這些函式刻意**不使用任何 npm 依賴**（只用執行環境內建的 `fetch`）。個股分析的
技術指標運算早就在瀏覽器裡跑（`src/utils/analyzer.js`），函式要做的只是轉傳
與整理上游資料，不需要 pandas。

## 為什麼不讓瀏覽器直接打上游

證交所的 MIS 即時快照（`mis.twse.com.tw`）沒有 CORS 標頭，而且會檢查 `Referer`，
瀏覽器打不到。AI 解讀則是必須把金鑰留在伺服器側。這一層同源代理就是為了這兩件事。

## 函式跑在香港（hkg1）

Vercel 函式預設跑在美東 `iad1`。部署後實測回應標頭是 `x-vercel-id: iad1`，
對台股網站很糟：`/api/quotes` 要從華盛頓打台灣的 MIS、再把結果送回台灣的
使用者，兩段都跨太平洋——而它盤中每 15 秒就被打一次。

`vercel.json` 設 `"regions": ["hkg1"]` 後兩段都在亞洲。AI 解讀要打美國的
NVIDIA，放哪都有一段跨洋，但 LLM 生成本身就要好幾秒，這點差異可忽略。

改區域後可以看回應標頭 `x-vercel-id` 的開頭確認生效。

## vercel.json 的 rewrite

SPA 的 catch-all 必須排除 `/api`：

```json
{ "source": "/((?!api/).*)", "destination": "/index.html" }
```

否則 `api/` 底下的函式會被整個吃掉，永遠回 `index.html`。

## 現有函式

| 路徑 | 說明 | 上游 |
|---|---|---|
| `GET /api/quotes?ids=2330,2317` | 批次即時報價，供策略頁盤中覆蓋收盤價 | 證交所 MIS 快照 |
| `POST /api/ai-commentary/stock-analysis` | 個股綜合解讀 → `{ commentary }` | NVIDIA NIM |
| `POST /api/ai-commentary/integrated` | 分段式整合報告 → `{ report }` | NVIDIA NIM |
| `POST /api/ai-commentary/market` | 首頁大盤解讀 → `{ commentary }` | NVIDIA NIM |
| `POST /api/ai-commentary/capital-flow` | 熱門產業摘要 → `{ commentary }` | NVIDIA NIM |

AI 解讀的提示詞放在 `_lib/prompts.js`，是從 `src/backend/ai_commentary.py`
機械複製過來的。那些提示詞調過（禁止模型自己算分數、禁止買賣建議、字數上限、
整合報告的分段格式），改寫就會讓輸出走鐘，所以兩邊要一起改。
`scripts/verify-ai-prompts.mjs` 會逐字比對，分岔測試就會紅。

**已知的無法消除差異**：Python 的 `json.loads("22.0")` 得到 float 印成 `22.0`，
JS 的 `JSON.parse("22.0")` 得到 Number 印成 `22`。小數點那位資訊在 parse 當下
就沒了，JS 端無法還原。prompt 裡會是「負債比 22%」而不是「22.0%」，語意相同。

## 環境變數（在 Vercel 專案設定裡加）

| 變數 | 用途 | 沒設的話 |
|---|---|---|
| `NVIDIA_API_KEY` | AI 解讀 | 四支都安靜回 `null`，頁面不顯示該區塊 |
| `NVIDIA_MODEL` | 覆蓋模型代號 | 用 `meta/llama-3.1-8b-instruct` |

`/api/quotes` 不需要任何金鑰。

## Render 還剩什麼

Render 已經不在任何**常見**路徑上，但還是退路，所以 `VITE_API_URL`
**先不要清空**：

| 端點 | 什麼時候才會用到 |
|---|---|
| `/api/raw-data/:query` | 該檔的 `raw_data_cache` 過期／沒暖到，或名稱不在前端的靜態對照表裡（新上市股票） |
| `/api/stock/:id/branch-data`、`/ptt` | 個股分析的分點與輿情分頁（爬蟲，尚未移植） |
| `/api/finmind/:dataset` 等 | 上面各項預先算好的文件讀不到時的退路 |

個股分析的常見路徑現在是 **前端解析代號/名稱 + Firestore 讀 `raw_data_cache`
+ Vercel Function 補即時報價**，完全不碰 Render。名稱解析用
`src/utils/resolveStock.js`，對照表動態載入（約 19 kB gzip，只在用名稱搜尋時載）。
暖快取由 `scripts/warm_raw_cache.py` 在台北 21:05 的那輪 Actions 執行。

已經搬過來的函式在前端是**明確指定同源**呼叫的（見 `src/services/api.js` 的
`callFunction` / `postFunction`），所以不受 `VITE_API_URL` 影響，兩邊可以並存。
