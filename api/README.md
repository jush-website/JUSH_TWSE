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

## 還沒搬過來的

以下仍指向 `VITE_API_URL`（Render）。搬完之前 `VITE_API_URL` 不要清空，
否則這些會 404：

- `/api/raw-data/:query` — 個股分析的原始資料
- `/api/ai-commentary/*` — 四支 AI 解讀
- `/api/finmind/:dataset` — 匯率與台指期日線
- `/api/stock/:id/branch-data`、`/api/stock/:id/ptt` — 分點與輿情

已經搬過來的函式在前端是**明確指定同源**呼叫的（見 `src/services/api.js` 的
`callFunction`），所以不受 `VITE_API_URL` 影響，兩邊可以並存直到搬完。
