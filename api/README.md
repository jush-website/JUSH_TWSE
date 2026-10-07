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

## 還沒搬過來的

以下仍指向 `VITE_API_URL`（Render）。搬完之前 `VITE_API_URL` 不要清空，
否則這些會 404：

- `/api/raw-data/:query` — 個股分析的原始資料
- `/api/finmind/:dataset` — 匯率與台指期日線
- `/api/stock/:id/branch-data`、`/api/stock/:id/ptt` — 分點與輿情

已經搬過來的函式在前端是**明確指定同源**呼叫的（見 `src/services/api.js` 的
`callFunction`），所以不受 `VITE_API_URL` 影響，兩邊可以並存直到搬完。
