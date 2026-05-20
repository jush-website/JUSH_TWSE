import axios from 'axios';

const api = axios.create({
  baseURL: '', // 在 Vercel 上前後端同網域，直接使用相對路徑
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

export const getStatus = () => api.get('/api/status');
export const getGlobalMarket = () => api.get('/api/global-market');
export const getNews = () => api.get('/api/news');
export const getLongTermRecommendations = () => api.get('/api/long-term-recommendations');
export const getHotStocks = () => api.get('/api/hot-stocks');
export const getShortTermRecommendations = () => api.get('/api/short-term-recommendations');
export const getBottomFishingRecommendations = () => api.get('/api/bottom-fishing-recommendations');
export const getShortTermBurstRecommendations = () => api.get('/api/short-term-burst-recommendations');
export const getOvernightRecommendations = (mode = "1") => api.get(`/api/overnight-recommendations?mode=${mode}`);
export const getCdpRecommendations = () => api.get('/api/cdp-recommendations');
export const getEtfRecommendations = () => api.get('/api/etf-recommendations');
export const getIndustries = () => api.get('/api/industries');
export const getIndustryStocks = (name) => api.get(`/api/industry/${name}`);
export const analyzeStock = (query) => api.get(`/api/analyze/${query}`);
export const syncData = (mode = "1") => api.post(`/api/sync?mode=${mode}`);

export default api;
