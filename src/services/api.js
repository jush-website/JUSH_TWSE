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

// 攔截器：GET 請求自動重試（Render 免費版冷啟動可能耗時 30-60 秒，
// 第一發請求容易 timeout / network error，重試兩次讓喚醒後的服務接手）
api.interceptors.response.use(undefined, async (error) => {
  const cfg = error.config;
  if (!cfg || (cfg.method || 'get').toLowerCase() !== 'get') return Promise.reject(error);

  const isRetryable =
    !error.response ||                      // timeout / network error
    error.response.status >= 500 ||         // server error
    error.response.status === 429;          // rate limited
  cfg.__retryCount = cfg.__retryCount || 0;
  if (!isRetryable || cfg.__retryCount >= 2) return Promise.reject(error);

  cfg.__retryCount += 1;
  const delay = 1500 * cfg.__retryCount;
  await new Promise(r => setTimeout(r, delay));
  return api(cfg);
});



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
      const timeStr = dateObj.toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit' });
      // If base_date exists, show it along with time, else show full date
      if (firestoreData.base_date) {
        updatedAtStr = `${firestoreData.base_date} ${timeStr}`;
      } else {
        updatedAtStr = `${dateObj.toLocaleDateString('zh-TW')} ${timeStr}`;
      }
    }
    return { 
      data: firestoreData.data || firestoreData,
      updated_at: updatedAtStr
    };
  } else {
    return { data: [], updated_at: null };
  }
};

export const getStatus = () => api.get('/api/status');
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
    const apiRes = await api.get('/api/capital-flow');
    if (apiRes && apiRes.data && apiRes.data.data) {
      return {
        data: apiRes.data.data,
        updated_at: apiRes.data.updated_at || apiRes.data.base_date
      };
    }
  } catch (err) {
    console.warn("API capital_flow fetch failed, falling back to Firestore", err);
  }
  return fetchFromFirestore('recommendations', 'capital_flow');
};

export const getMarketBreadth = async () => {
  const apiRes = await api.get('/api/market-breadth');
  const d = apiRes.data;
  const timeStr = new Date().toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit' });
  return { 
    data: d.data || d, 
    updated_at: d.base_date ? `${d.base_date} ${timeStr}` : `${new Date().toLocaleDateString('zh-TW')} ${timeStr}`
  };
};

export const getInstitutionalFlow = async () => {
  try {
    const res = await fetchFromFirestore('recommendations', 'institutional_flow');
    if (res && res.data && res.data.length > 0) return res;
  } catch (err) {
    console.warn("Firestore institutional_flow fetch failed, falling back to API", err);
  }
  const apiRes = await api.get('/api/institutional-flow');
  return { data: apiRes.data, updated_at: new Date().toLocaleDateString('zh-TW') + ' ' + new Date().toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit' }) };
};
export const getIndustries = () => api.get('/api/industries');
export const getIndustryStocks = (name) => api.get(`/api/industry/${name}`);
export const analyzeStock = (query) => api.get(`/api/analyze/${query}`);
export const syncData = (mode = "1") => api.post(`/api/sync?mode=${mode}`);
export const getFutures = () => api.get('/api/futures');
export const getMarketOutlook = () => api.get('/api/market-outlook');

// 批次即時報價：盤中將策略卡片過時的收盤價覆蓋為即時價
export const getQuotes = async (ids = []) => {
  if (!ids || ids.length === 0) return {};
  try {
    const res = await api.get(`/api/quotes?ids=${ids.join(',')}`);
    return res.data || {};
  } catch (err) {
    console.warn('getQuotes failed', err);
    return {};
  }
};

// 個股分析頁：把前端已經算好的技術指標/診斷/CDP/基本面節錄送給後端，
// 由 NVIDIA NIM 產生一段綜合解讀。沒設定金鑰或呼叫失敗都回傳 null，
// 呼叫端只要判斷 null 就不顯示這個區塊即可，不影響其餘分析結果。
export const getStockAnalysisCommentary = async (analysisData) => {
  try {
    const res = await api.post('/api/ai-commentary/stock-analysis', analysisData);
    return res.data?.commentary || null;
  } catch (err) {
    console.warn('AI 綜合解讀取得失敗', err);
    return null;
  }
};

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
