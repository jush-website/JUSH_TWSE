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
export const getCapitalFlow = async () => {
  try {
    const res = await fetchFromFirestore('recommendations', 'capital_flow');
    if (res.data && res.data.length > 0) return res;
  } catch (err) {
    console.warn("Firestore capital_flow fetch failed, falling back to API", err);
  }
  const apiRes = await api.get('/api/capital-flow');
  return { data: apiRes.data, updated_at: new Date().toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit' }) };
};
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
  
  if (res.data.msg === "超過使用次數") {
    throw new Error("超過使用次數");
  }
  return res.data.data || [];
};

import { analyzeStockData } from '../utils/analyzer';

import stockDataMap from '../assets/stock_names.json';

export const analyzeStockRaw = async (query) => {
  // 1. 解析股票代碼與名稱 
  let rawQuery = query.trim();
  let stockId = rawQuery;
  let stockName = "未知";
  let category = "未知";

  if (stockDataMap) {
    if (stockDataMap.id_map && stockDataMap.id_map[rawQuery]) {
      stockId = rawQuery;
      stockName = stockDataMap.id_map[rawQuery];
    } else if (stockDataMap.name_map && stockDataMap.name_map[rawQuery]) {
      stockId = stockDataMap.name_map[rawQuery];
      stockName = rawQuery;
    }

    if (stockDataMap.industry) {
      const row = stockDataMap.industry.find(r => r.stock_id === stockId);
      if (row) {
        category = row.industry || row.industry_category || "未知";
      }
    }
  }

  // 2. 在前端平行發送 3 個請求抓取歷史資料 (非常快)
  console.log("前端發送請求拉取資料...");
  const [priceData, chipData, marginData, perData] = await Promise.all([
    fetchFinmind('TaiwanStockPrice', stockId, 90), // 近90個交易日
    fetchFinmind('TaiwanStockInstitutionalInvestorsBuySell', stockId, 25), // 近25個交易日
    fetchFinmind('TaiwanStockMarginPurchaseShortSale', stockId, 15), // 近15個交易日
    fetchFinmind('TaiwanStockPER', stockId, 5) // 近5個交易日的本益比等基本面資料
  ]);

  console.log("前端拉取完畢，開始在本地端進行運算...");
  const payload = {
    stock_id: stockId,
    stock_name: stockName,
    category: category,
    price_data: priceData,
    chip_data: chipData,
    margin_data: marginData,
    per_data: perData,
    intraday: null 
  };

  // 直接在前端執行複雜的 JS 分析運算，千分之一秒完成
  const analysisResult = analyzeStockData(payload);
  
  if (analysisResult.error) {
    throw new Error(analysisResult.error);
  }

  // 模擬 Axios 回傳格式以相容既有 UI
  return { data: analysisResult };
};

export default api;
