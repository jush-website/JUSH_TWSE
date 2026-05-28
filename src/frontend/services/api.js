import axios from 'axios';

const api = axios.create({
  // 回復使用 VITE_API_URL 讓前端呼叫 Render
  baseURL: import.meta.env.VITE_API_URL || '', 
});

// 攔截器：如果 Vercel 回傳了 index.html (通常是因為 API 崩潰或尚未部署)，則視為錯誤
api.interceptors.response.use(
  (response) => {
    if (typeof response.data === 'string' && response.data.includes('<!doctype html>')) {
      return Promise.reject(new Error('API returned HTML instead of JSON. The backend might be offline or failed to build.'));
    }
    return response;
  },
  (error) => Promise.reject(error)
);



import { doc, getDoc } from "firebase/firestore";
import { db } from "./firebase";

const fetchFromFirestore = async (collectionName, docId) => {
  const docRef = doc(db, collectionName, docId);
  const docSnap = await getDoc(docRef);
  if (docSnap.exists()) {
    const firestoreData = docSnap.data();
    let updatedAtStr = null;
    if (firestoreData.updated_at) {
      const dateObj = typeof firestoreData.updated_at.toDate === 'function' 
        ? firestoreData.updated_at.toDate() 
        : new Date(firestoreData.updated_at);
      updatedAtStr = dateObj.toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit' });
    }
    return { 
      data: firestoreData.data || firestoreData,
      updated_at: updatedAtStr
    };
  } else {
    return { data: [], updated_at: null };
  }
};

export const getStatus = () => fetchFromFirestore('system', 'status');
export const getGlobalMarket = () => api.get('/api/global-market');
export const getNews = () => api.get('/api/news');
export const getLongTermRecommendations = () => fetchFromFirestore('recommendations', 'long_term');
export const getHotStocks = () => fetchFromFirestore('recommendations', 'hot_stocks');
export const getShortTermRecommendations = () => fetchFromFirestore('recommendations', 'short_term');
export const getBottomFishingRecommendations = () => fetchFromFirestore('recommendations', 'bottom_fishing');
export const getShortTermBurstRecommendations = () => fetchFromFirestore('recommendations', 'short_term_burst');
export const getDayTradeCdpRecommendations = () => fetchFromFirestore('recommendations', 'day_trade_cdp');
export const getOvernightRecommendations = (mode = "1") => fetchFromFirestore('recommendations', `overnight_${mode}`);
export const getCdpRecommendations = () => fetchFromFirestore('recommendations', 'cdp');
export const getEtfRecommendations = () => fetchFromFirestore('recommendations', 'etf');
export const getIndustries = () => api.get('/api/industries');
export const getIndustryStocks = (name) => api.get(`/api/industry/${name}`);
export const analyzeStock = (query) => api.get(`/api/analyze/${query}`);
export const syncData = (mode = "1") => api.post(`/api/sync?mode=${mode}`);
export const getFutures = () => api.get('/api/futures');
export const getMarketOutlook = () => api.get('/api/market-outlook');

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

  // 2. 在前端平行發送 3 個請求抓取歷史資料 (非常快)
  console.log("前端開始抓取原始資料...");
  const [priceData, chipData, marginData] = await Promise.all([
    fetchFinmind('TaiwanStockPrice', stockId, 90), // 約60個交易日
    fetchFinmind('TaiwanStockInstitutionalInvestorsBuySell', stockId, 25), // 約15個交易日
    fetchFinmind('TaiwanStockMarginPurchaseShortSale', stockId, 15) // 約10個交易日
  ]);

  // 3. 將巨大 JSON 打包送到後端進行 Pandas 數學運算
  // (即時股價 intradaySnapshot 交由後端 yfinance 處理)
  console.log("前端抓取完畢，送交後端進行指標運算...");
  const payload = {
    stock_id: stockId,
    price_data: priceData,
    chip_data: chipData,
    margin_data: marginData,
    intraday: null
  };

  const analysisRes = await api.post('/api/analyze-raw', payload);
  return analysisRes;
};

export default api;
