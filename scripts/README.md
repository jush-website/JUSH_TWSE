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
