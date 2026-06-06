import axios from 'axios';

const api = axios.create({
  // 回復使用 VITE_API_URL 讓前端呼叫 Render
  baseURL: import.meta.env.VITE_API_URL || '', 
  timeout: 60000, // 放大到 60 秒以容忍 FinMind 大量資料抓取
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
    if (res && res.data && (res.data.length > 0 || res.data.industries)) return res;
  } catch (err) {
    console.warn("Firestore capital_flow fetch failed, falling back to API", err);
  }
  const apiRes = await api.get('/api/capital-flow');
  return { data: apiRes.data, updated_at: new Date().toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit' }) };
};

export const getMarketBreadth = async () => {
  const apiRes = await api.get('/api/market-breadth');
  return { data: apiRes.data, updated_at: new Date().toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit' }) };
};

export const getInstitutionalFlow = async () => {
  try {
    const res = await fetchFromFirestore('recommendations', 'institutional_flow');
    if (res && res.data && res.data.length > 0) return res;
  } catch (err) {
    console.warn("Firestore institutional_flow fetch failed, falling back to API", err);
  }
  const apiRes = await api.get('/api/institutional-flow');
  return { data: apiRes.data, updated_at: new Date().toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit' }) };
};
export const getIndustries = () => api.get('/api/industries');
export const getIndustryStocks = (name) => api.get(`/api/industry/${name}`);
export const analyzeStock = (query) => api.get(`/api/analyze/${query}`);
export const getAIAnalysis = (payload) => api.post(`/api/ai-analyze`, payload);
export const syncData = (mode = "1") => api.post(`/api/sync?mode=${mode}`);
export const getFutures = () => api.get('/api/futures');
export const getMarketOutlook = () => api.get('/api/market-outlook');

// 透過後端 Proxy 取得 FinMind 歷史資料 (避免瀏覽器 CORS 或無 token 造成的 Rate Limit)
const fetchFinmind = async (dataset, stockId, daysAgo) => {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  const startDate = d.toISOString().split('T')[0];
  const url = `/api/finmind/${dataset}?data_id=${stockId}&start_date=${startDate}`;
  const res = await api.get(url);
  
  if (res.data.msg === "超過使用次數") {
    throw new Error("超過使用次數 (Backend API Rate Limited)");
  }
  return res.data.data || [];
};

import { analyzeStockData } from '../utils/analyzer';

import stockDataMap from '../assets/stock_names.json';

export const analyzeStockRaw = async (query) => {
  // 1. 整理輸入
  let rawQuery = query.trim();
  
  console.log("前端發送單一請求取得個股原始資料...");
  // 透過後端一次性取得所需的所有歷史資料 (由後端做 FinMind 請求與快取)
  const res = await api.get(`/api/raw-data/${rawQuery}`);
  const payload = res.data; // 包含 price_data, chip_data, margin_data, per_data, intraday 等

  console.log("資料獲取完畢，開始在本地端進行分析...");

  // 直接傳給前端 JS 分析器
  const analysisResult = analyzeStockData(payload);
  
  if (analysisResult.error) {
    throw new Error(analysisResult.error);
  }

  // 模擬 Axios 回傳格式以相容既有 UI
  return { data: analysisResult };
};

export default api;
