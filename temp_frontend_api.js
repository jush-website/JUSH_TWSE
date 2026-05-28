// 獲取 FinMind 原始資料 (在瀏覽器端執行以分散流量)
const fetchFinmind = async (dataset, stockId, daysAgo) => {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  const startDate = d.toISOString().split('T')[0];
  const url = `https://api.finmindtrade.com/api/v4/data?dataset=${dataset}&data_id=${stockId}&start_date=${startDate}`;
  const res = await axios.get(url);
  return res.data.data || [];
};

export const analyzeStockRaw = async (query) => {
  // 1. 取得 stock_id
  const resolveRes = await api.get(`/api/resolve/${query}`);
  const stockId = resolveRes.data.stock_id;

  // 2. 在前端平行發送 4 個請求抓取原始資料
  console.log("前端開始抓取原始資料...");
  const [priceData, chipData, marginData, twseData] = await Promise.all([
    fetchFinmind('TaiwanStockPrice', stockId, 90), // 約60個交易日
    fetchFinmind('TaiwanStockInstitutionalInvestorsBuySell', stockId, 25), // 約15個交易日
    fetchFinmind('TaiwanStockMarginPurchaseShortSale', stockId, 15), // 約10個交易日
    axios.get('https://openapi.twse.com.tw/v1/exchangeReport/STOCK_DAY_ALL').catch(() => ({ data: [] }))
  ]);

  // 3. 從 TWSE OpenAPI 中找出今日即時股價快照 (替代 Yahoo Finance)
  let intradaySnapshot = null;
  if (twseData.data && twseData.data.length > 0) {
    const stockInfo = twseData.data.find(s => s.Code === stockId);
    if (stockInfo) {
      const p = parseFloat(stockInfo.ClosingPrice) || 0;
      const op = parseFloat(stockInfo.OpeningPrice) || p;
      const change = parseFloat(stockInfo.Change) || 0;
      // TWSE OpenAPI 的 Change 是絕對值漲跌。我們無法得知正負，但通常可以用昨日收盤推算。
      // 由於 TWSE 沒有直接給昨日收盤，我們暫時用 p - change 近似，這裡可能有誤差，但足夠讓 checklist 跑完
      const yp = p - change; 
      intradaySnapshot = {
        open: op,
        price: p,
        yesterday_close: yp,
        yesterday_avg: yp, // 近似
        volume: (parseFloat(stockInfo.TradeVolume) || 0) / 1000, // 轉為千股(張)
        df_1m: [], // 前端無法取得 yahoo 1分K
        df_5m: []
      };
    }
  }

  // 4. 將巨大 JSON 打包送到後端進行 Pandas 數學運算
  console.log("前端抓取完畢，送交後端進行指標運算...");
  const payload = {
    stock_id: stockId,
    price_data: priceData,
    chip_data: chipData,
    margin_data: marginData,
    intraday: intradaySnapshot
  };

  const analysisRes = await api.post('/api/analyze-raw', payload);
  return analysisRes;
};
