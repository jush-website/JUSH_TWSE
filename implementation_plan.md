# 新增分佈圖、籌碼分析與校正資金流向時間

本次更新將實作您要求的三項功能：校正資金流向的數據時間、開發「大盤漲跌分佈圖」，以及開發「分點籌碼分析」功能。

> [!IMPORTANT]
> **User Review Required (需用戶確認的設計決策)**
> 
> 關於**分點籌碼功能**的資料來源：
> FinMind 官方的「分點買賣超」API 需要付費贊助才能使用；而您提供的 `futures-ai.com` 是高度動態渲染且具備 API 防護機制的網站，直接使用 HTTP 爬蟲極易遭到阻擋或日後頻繁失效。
> 
> **方案建議**：我計畫在後端開發一組客製化爬蟲，改為抓取老牌財經網站（例如 `HiStock 嗨投資` 或 `Goodinfo! 台灣股市資訊網`）的個股分點籌碼網頁。這些網站的 HTML 結構穩定，能穩定解析出「前十大買/賣超分點」與「張數/均價」資料，並以極佳的效能回傳給我們的前端。請問您是否同意使用此替代方案？

## Proposed Changes

### 1. 資金流向板塊時間校正

#### [MODIFY] `src/backend/web_app.py`
- 修改 `/api/capital-flow` API 端點。
- 捨棄目前基於系統時間推算的 `get_last_expected_trading_date()`。
- 改為直接從 `fetcher._official_cache["TAIEX"]["date"]` 中提取，確保資料時間是**絕對準確的實際交易日**（與大盤多空指標的修正邏輯一致）。

---

### 2. 大盤漲跌分佈圖 (Market Price Change Distribution)

我們將利用系統已經每天自動抓取的全市場 (上市+上櫃) 報價快取 (`self._official_cache`)，直接在後端計算分佈，無需依賴外部爬蟲。

#### [MODIFY] `src/backend/web_app.py`
- 新增 API 端點 `/api/market-distribution`。
- 邏輯：遍歷快取中所有股票的 `change_pct` (漲跌幅)，將其四捨五入歸類至 -10% 到 +10% 的級距 (Bucket) 中。
- 在每個級距內，依據當日成交量 (Volume) 由大到小排序，提取前 20 檔作為該級距的「熱門標的」。

#### [NEW] `src/pages/MarketDistribution.jsx`
- 新增漲跌分佈圖專屬頁面（並整合入 Navbar）。
- 實作視覺化的雙色長條圖 (紅綠柱狀圖)，X軸為漲跌幅級距，Y軸為家數。
- 實作互動式浮動面板 (Modal/Tooltip)：當點擊或懸停於某根柱子時，彈出一個深色面板，顯示該級距中的「熱門標的」清單（包含股票名稱、代碼、漲跌幅與股價），完美還原您提供的截圖設計風格。

---

### 3. 分點籌碼功能 (Broker Branch Analysis)

#### [NEW] `src/backend/branch_scraper.py`
- 建立專屬爬蟲模組，使用 `requests` + `BeautifulSoup` 配合適當的 Headers 偽裝，從穩定的來源 (如 HiStock) 抓取特定股票（如 2330）的當日/近期分點進出明細。
- 解析出「買超分點排行」與「賣超分點排行」（包含券商名稱、買賣張數、佔總成交量比例等）。

#### [MODIFY] `src/backend/web_app.py`
- 新增 API 端點 `/api/stock/{stock_id}/branch-data` 來呼叫上述爬蟲並回傳 JSON。

#### [MODIFY] `src/pages/StockAnalysis.jsx`
- 在個股綜合分析頁面中，新增一個「分點籌碼」的選單分頁 (Tab)。
- 實作精美的「買方主力」與「賣方主力」對比表格設計，清晰呈現主力分點的分佈與籌碼流向。

## Verification Plan

### Automated / Backend Verification
- 測試 `/api/capital-flow` 回傳的 `base_date` 是否精確匹配當日大盤日期。
- 測試 `/api/market-distribution` 是否能正確回傳 21 個級距 (-10 ~ 10) 的家數統計與關聯的熱門標的。
- 單獨執行 `branch_scraper.py` 腳本，驗證是否能成功繞過防護並正確解析出台積電 (2330) 的分點數據。

### UI Verification
- 確認導覽列有「大盤漲跌分佈」入口，且圖表的顏色、彈出視窗樣式與截圖美感一致。
- 查詢任一個股，切換至「分點籌碼」頁籤，確認分點排行榜的 UI 對齊且資料合理。
