import axios from 'axios';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'https://jush-twse.onrender.com', // 使用環境變數或 Render 的 API 網址
});

export const getStatus = () => api.get('/api/status');
export const getGlobalMarket = () => api.get('/api/global-market');
export const getNews = () => api.get('/api/news');
export const getLongTermRecommendations = (force = false) => api.get(`/api/long-term-recommendations?force=${force}`);
export const getHotStocks = () => api.get('/api/hot-stocks');
export const getShortTermRecommendations = (force = false) => api.get(`/api/short-term-recommendations?force=${force}`);
export const getBottomFishingRecommendations = (force = false) => api.get(`/api/bottom-fishing-recommendations?force=${force}`);
export const getShortTermBurstRecommendations = (force = false) => api.get(`/api/short-term-burst-recommendations?force=${force}`);
export const getOvernightRecommendations = (force = false, mode = "1") => api.get(`/api/overnight-recommendations?force=${force}&mode=${mode}`);
export const getCdpRecommendations = () => api.get('/api/cdp-recommendations');
export const getEtfRecommendations = () => api.get('/api/etf-recommendations');
export const getIndustries = () => api.get('/api/industries');
export const getIndustryStocks = (name) => api.get(`/api/industry/${name}`);
export const analyzeStock = (query) => api.get(`/api/analyze/${query}`);
export const syncData = (mode = "1") => api.post(`/api/sync?mode=${mode}`);
export const getFutures = () => api.get('/api/futures');
export const getMarketOutlook = () => api.get('/api/market-outlook');

export default api;
