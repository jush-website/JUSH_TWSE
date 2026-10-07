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
