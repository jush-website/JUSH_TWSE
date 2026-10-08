# scripts/

離線驗證腳本，不參與前端打包。用 `node` 直接跑即可（無需安裝額外套件）。

## verify-significance.mjs

把 `src/utils/significance.js` 的輸出逐項對照 Python 原版
（[反詐投資王](https://github.com/mars-tw/anti-gambling-trader-tw)
的 `core/verdict/statistics.py`）產生的黃金向量。

```bash
node scripts/verify-significance.mjs scripts/significance-golden.json
```

決定性的部分（t 分布尾端機率、不完全 beta、所需樣本量、平均、標準差）要求
吻合到 1e-9；bootstrap 的 p 值與信賴區間因為兩邊用不同語言的 PRNG，無法
位元相同，只檢查落在蒙地卡羅誤差內。

### 重新產生黃金向量

需要先取得原專案（純標準庫，不必安裝依賴）：

```bash
git clone --depth 1 https://github.com/mars-tw/anti-gambling-trader-tw /tmp/agt
cd /tmp/agt && python3 -I -c "..."   # 見 verify-significance.mjs 檔頭說明
```

## verify-backtest-verdict.mjs

驗證 `src/utils/backtest.js` 的統計裁決。分兩層：

1. `judgeReturns`：直接餵構造好的「每筆報酬」陣列，正確答案由統計性質決定，
   與 CDP 進出場幾何無關。
2. `backtestCdpDayTrade`：確認進出場抽取正確、既有欄位沒壞、固定種子讓 p 值
   在重複呼叫下完全相同。

```bash
node scripts/verify-backtest-verdict.mjs
```

## verify-precomputed-shapes.mjs

用後端九個 handler 的真實回傳形狀，驗證「Firestore 直讀」與「退回 Render API」
兩條路徑給出相同 payload，並逐一檢查呼叫端實際讀取的欄位存在。形狀不一致
不會丟錯、只會讓圖表默默變空，所以必須明確測。

```bash
node scripts/verify-precomputed-shapes.mjs
```

## verify-quotes-function.mjs

用假的上游測 `api/quotes.js`：代號白名單過濾、MIS 欄位轉換（成交價／漲跌幅／
張數轉股數／日期）、尚無成交時退回昨收、分批、部分失敗降級、CDN 快取標頭、405。

```bash
node scripts/verify-quotes-function.mjs
```

## verify-function-routing.mjs

真的起一個 `node:http` server 掛上函式做 HTTP 呼叫，並驗證 `vercel.json` 的
rewrite 正則確實放行 `/api` 而攔下其他路徑（SPA 的 catch-all 若沒排除 `/api`，
函式會永遠回 `index.html`）。

```bash
node scripts/verify-function-routing.mjs
```

## verify-ai-prompts.mjs

把 `api/ai-commentary/[kind].js` 送往 NVIDIA 的 prompt 與 Python 原版
（`src/backend/ai_commentary.py`）逐字比對，外加回應形狀、無金鑰／429／逾時／
素材不足都安靜回 `null`、金鑰不外洩等行為。

```bash
node scripts/verify-ai-prompts.mjs scripts/prompt-golden.json scripts/payloads.json
```

### 重新產生 prompt 黃金檔

在裝好 `requirements.txt` 的環境下，用假的 `_call_nvidia` 攔下 prompt：

```python
import json, os
os.environ["NVIDIA_API_KEY"] = "dummy"       # 不設的話 generate_* 會直接回 None
from src.backend import ai_commentary as A
captured = {}
A._call_nvidia = lambda s, u, max_tokens=150, temperature=0.4: (
    captured.update(system=s, user=u, max_tokens=max_tokens, temperature=temperature) or "X")
A.generate_market_commentary(json.load(open("scripts/payloads.json"))["market"])
print(captured)
```

## Python 端的驗證

`scripts/sync_market_data.py` 與 `scripts/sync_strategies.py` 需要
`requirements.txt` 的依賴。本機建議用 venv（系統 Python 的 setuptools 可能
讓 FinMind 的 `ta` 依賴編譯失敗）：

```bash
python3 -m venv .venv && .venv/bin/pip install -r requirements.txt
.venv/bin/python -m scripts.sync_market_data --list
.venv/bin/python -m scripts.sync_market_data --dry-run --only futures
```

## verify-raw-data-cache.mjs

驗證 `src/utils/rawDataCache.js`：快取 TTL 必須與後端
`web_app.get_raw_data()` 的 `cache_ttl` 一致（盤中 30 分、盤後 4 小時），
盤中判斷用台北時區（用本機時區的話海外使用者會得到完全錯誤的 TTL，
所以特別測跨時區的邊界），以及報價轉 `intraday` 時不虛構後端才有的欄位。

```bash
node scripts/verify-raw-data-cache.mjs
```

## warm_raw_cache.py

把熱門股的個股原始資料預先抓進 Firestore 的 `raw_data_cache`，讓個股分析頁
可以直接讀 Firestore 而不必叫醒後端。直接呼叫 `web_app.get_raw_data()`，
也就是 Render 上實際在跑的那條路徑。

**很吃 FinMind 額度**：每檔約 8-18 次請求（新聞那段最多往前試 10 天），
所以預設只暖 15 檔，且只在台北 21:05 那輪 Actions 執行。

```bash
.venv/bin/python -m scripts.warm_raw_cache --limit 15
.venv/bin/python -m scripts.warm_raw_cache --ids 2330,2317
```

## verify-resolve-stock.mjs

驗證 `src/utils/resolveStock.js` 的前端代號/名稱解析，用真實的
`src/assets/stock_names.json`（2367 檔）：

- 代號直接回、名稱完全相同、部分比對（確認回傳的名稱真的包含關鍵字）
- **與後端 `resolve_stock_id()` 的等價性**：抽 600 筆代號與完全相同的名稱，
  要求結果完全一致
- 查不到回 `null`（讓呼叫端退回後端）、結果可重現、對照表只載一次
- **建置輸出**：對照表必須是獨立 chunk、佔 75% 體積的 `industry` 必須被
  tree-shaking 搖掉、且不出現在首包的 preload 清單（需先 `npm run build`）

```bash
npm run build && node scripts/verify-resolve-stock.mjs
```

測的是 `resolveFromMap`（純函式）而不是 `resolveStockId`：後者會動態 import
JSON，那需要打包器支援（Node 的 ESM 要 import attribute）。動態載入與
tree-shaking 由上面的建置輸出檢查涵蓋。

### 與後端刻意不同的地方

部分比對時後端取「迭代到的第一筆」，順序取決於 TWSE API 的回傳順序（任意）；
前端取「最短的符合名稱，同長度比代號」，結果穩定且通常更貼近使用者想找的
那檔（輸入「長榮」給長榮而不是長榮航）。因為前端查不到才會退回後端，
所以使用者看到的結果是確定的。

## verify-precomputed-freshness.mjs

驗證 `fetchPrecomputed` 判定 Firestore 預算文件過期的門檻：基準日落後 1 個
工作日（收盤前的正常狀態）算新鮮，落後 2 個以上（排程整天沒成功）才改打 API。

```bash
node scripts/verify-precomputed-freshness.mjs
```

## verify-firestore-rest.mjs

驗證 `src/services/firestoreRest.js`（取代 firebase SDK 的輕量讀取器）的型別
解碼。移除 SDK 前已對正式環境全部文件做過 SDK ↔ REST 逐一比對，結果一致。

```bash
node scripts/verify-firestore-rest.mjs
```
