import axios from 'axios';
import { getFirestoreClient } from './firebase';
import { isCacheFresh, looksLikeStockId, quoteToIntraday } from '../utils/rawDataCache';

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

const fetchFromFirestore = async (collectionName, docId) => {
  const { db, doc, getDoc } = await getFirestoreClient();
  const docSnap = await getDoc(doc(db, collectionName, docId));
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
      updated_at: updatedAtStr,
      // 原始基準日另外帶出來，呼叫端才有辦法判斷這份資料是不是已經過期。
      // updated_at 是給人看的字串，不適合拿來比較。
      base_date: firestoreData.base_date || null
    };
  } else {
    return { data: [], updated_at: null, base_date: null };
  }
};

/**
 * 先讀 Firestore 上預先算好的資料，讀不到才退回 Render 的即時端點。
 *
 * 這些資料（全球指數、新聞、台指期、走勢展望、漲跌家數、多空分布…）都是
 * 全市場共用、一天只變幾次，卻原本每次造訪都即時打 Render。Render 免費方案
 * 休眠後的冷啟動要 30-60 秒，等於首頁最慢的一環是為了算一份人人相同的資料。
 * 現在由 GitHub Actions 盤後算好寫進 Firestore（見 scripts/sync_market_data.py），
 * 前端直讀，讀取延遲只剩 Firestore 的 CDN 等級。
 *
 * Render 仍留作退路，是為了讓這次遷移可以逐步進行：Firestore 上還沒有對應
 * 文件時（例如第一次部署、或某項目當天同步失敗）行為與以前完全一樣。
 *
 * @param {string} docId      Firestore recommendations 集合裡的文件 id
 * @param {string} apiPath    對應的 Render 端點，作為退路
 * @returns {Promise<{data: any, updated_at: string|null, base_date: string|null, source: 'firestore'|'api'}>}
 */
// 後端各 handler 的回傳形狀不一致：有的是 { data: [...] , base_date }，
// 有的直接就是 payload。呼叫端原本各自用 `res.data.data || res.data` 處理，
// 這裡統一剝掉一層 data 包裝，讓兩條路徑（Firestore / API）給出相同形狀。
const unwrap = (v) =>
  v && typeof v === 'object' && !Array.isArray(v) && 'data' in v ? v.data : v;

const isEmptyPayload = (v) =>
  v == null
  || (Array.isArray(v) && v.length === 0)
  || (typeof v === 'object' && !Array.isArray(v) && Object.keys(v).length === 0);

const fetchPrecomputed = async (docId, apiPath) => {
  try {
    const res = await fetchFromFirestore('recommendations', docId);
    const payload = unwrap(res.data);
    // fetchFromFirestore 在文件不存在時回傳空陣列，要把那種情況視為「沒有資料」
    if (!isEmptyPayload(payload)) {
      return { data: payload, updated_at: res.updated_at, base_date: res.base_date, source: 'firestore' };
    }
  } catch (err) {
    console.warn(`Firestore ${docId} 讀取失敗，改打 API`, err);
  }
  const apiRes = await api.get(apiPath);
  const d = apiRes.data;
  return {
    data: unwrap(d),
    updated_at: d?.updated_at ?? d?.base_date ?? null,
    base_date: d?.base_date ?? null,
    source: 'api',
  };
};

export const getStatus = () => api.get('/api/status');
export const getGlobalMarket = () => fetchPrecomputed('global_market', '/api/global-market');
export const getNews = () => fetchPrecomputed('news', '/api/news');
export const getLongTermRecommendations = () => fetchFromFirestore('recommendations', 'long_term');
export const getHotStocks = () => fetchFromFirestore('recommendations', 'hot_stocks');
export const getShortTermRecommendations = () => fetchFromFirestore('recommendations', 'short_term');
export const getBottomFishingRecommendations = () => fetchFromFirestore('recommendations', 'bottom_fishing');
export const getShortTermBurstRecommendations = () => fetchFromFirestore('recommendations', 'short_term_burst');
export const getDayTradeCdpRecommendations = () => fetchFromFirestore('recommendations', 'day_trade_cdp');
export const getOvernightRecommendations = (mode = "1") => fetchFromFirestore('recommendations', `overnight_${mode}`);
export const getCdpRecommendations = () => fetchFromFirestore('recommendations', 'cdp');
export const getEtfRecommendations = () => fetchFromFirestore('recommendations', 'etf');
export const getCapitalFlow = () => fetchPrecomputed('capital_flow', '/api/capital-flow');

export const getMarketBreadth = () => fetchPrecomputed('market_breadth', '/api/market-breadth');

export const getInstitutionalFlow = () => fetchPrecomputed('institutional_flow', '/api/institutional-flow');

// 大盤多空分布與美債殖利率：原本由頁面直接 api.get，現在一併走預先算好的路徑
export const getMarketDistribution = () => fetchPrecomputed('market_distribution', '/api/market-distribution');
export const getUsTreasury = () => fetchPrecomputed('us_treasury', '/api/macro/us-treasury');

// 匯率與台指期日線：全市場共用、一天只變一次，沒有理由讓每個使用者各自去打一次
// FinMind（既浪費額度也要等 Render 冷啟動）。改讀 Actions 預先算好的文件，
// 退路仍是原本的 FinMind 代理端點。
const FINMIND_START = () => {
  const d = new Date();
  d.setMonth(d.getMonth() - 3);
  return d.toISOString().split('T')[0];
};
export const getExchangeRate = () =>
  fetchPrecomputed('exchange_rate', `/api/finmind/TaiwanExchangeRate?data_id=USD&start_date=${FINMIND_START()}`);
export const getFuturesDaily = () =>
  fetchPrecomputed('futures_daily', `/api/finmind/TaiwanFuturesDaily?data_id=TX&start_date=${FINMIND_START()}`);
export const getIndustries = () => api.get('/api/industries');
export const getIndustryStocks = (name) => api.get(`/api/industry/${name}`);
export const analyzeStock = (query) => api.get(`/api/analyze/${query}`);
export const syncData = (mode = "1") => api.post(`/api/sync?mode=${mode}`);
export const getFutures = () => fetchPrecomputed('futures', '/api/futures');
export const getMarketOutlook = () => fetchPrecomputed('market_outlook', '/api/market-outlook');

// Firestore 資料過時/沒同步時的即時互補：直接跟 Render 要現算的推薦清單
// （後端有自己的快取，熱快取秒回；冷快取會現算，可能耗時 1~2 分鐘）
const LIVE_REC_ENDPOINTS = {
  'short-term': '/api/short-term-recommendations',
  'overnight': '/api/overnight-recommendations',
  'bottom': '/api/bottom-fishing-recommendations',
  'burst': '/api/short-term-burst-recommendations',
  'long-term': '/api/long-term-recommendations',
  'etf': '/api/etf-recommendations',
  'cdp': '/api/cdp-recommendations',
  'day-trade-cdp': '/api/recommendations/day-trade-cdp',
};

export const getLiveRecommendations = async (type) => {
  const url = LIVE_REC_ENDPOINTS[type];
  if (!url) return null;
  const res = await api.get(url, { timeout: 150000 });
  const list = Array.isArray(res.data) ? res.data : res.data?.data || [];
  const now = new Date();
  return {
    data: list,
    updated_at: `${now.toLocaleDateString('zh-TW')} ${now.toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit' })} 即時運算`,
  };
};

// 批次即時報價：盤中將策略卡片過時的收盤價覆蓋為即時價
// 已經搬到 Vercel Function 的端點走這條：明確指定同源（baseURL 清空），
// 不受 VITE_API_URL 影響。還沒搬完的端點仍指向 Render，兩邊可以並存，
// 遷移才能一支一支來而不是一次切換。見 api/README.md。
const callFunction = (path, config = {}) => api.get(path, { baseURL: '', ...config });
const postFunction = (path, body, config = {}) => api.post(path, body, { baseURL: '', ...config });

export const getQuotes = async (ids = []) => {
  if (!ids || ids.length === 0) return {};
  try {
    const res = await callFunction(`/api/quotes?ids=${ids.join(',')}`, { timeout: 15000 });
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
    const res = await postFunction('/api/ai-commentary/stock-analysis', analysisData, { timeout: 30000 });
    return res.data?.commentary || null;
  } catch (err) {
    console.warn('AI 綜合解讀取得失敗', err);
    return null;
  }
};

// AI 整合分析分頁：把五個面向（技術/籌碼/分點/基本面/新聞）的節錄送給後端，
// 由 NVIDIA NIM 產生分段式整合報告。失敗回傳 null，呼叫端顯示錯誤提示即可。
export const getIntegratedAnalysis = async (payload) => {
  try {
    const res = await postFunction('/api/ai-commentary/integrated', payload, { timeout: 90000 });
    return res.data?.report || null;
  } catch (err) {
    console.warn('AI 整合分析取得失敗', err);
    return null;
  }
};

// 首頁大盤 AI 解讀：整合走勢展望/台指期/全球市場/新聞標題。失敗回傳 null。
export const getMarketAiCommentary = async (payload) => {
  try {
    const res = await postFunction('/api/ai-commentary/market', payload, { timeout: 90000 });
    return res.data?.commentary || null;
  } catch (err) {
    console.warn('大盤 AI 解讀取得失敗', err);
    return null;
  }
};

// 資金流向頁 AI 摘要：整合產業資金分布與新聞題材。失敗回傳 null。
export const getCapitalFlowAiCommentary = async (payload) => {
  try {
    const res = await postFunction('/api/ai-commentary/capital-flow', payload, { timeout: 90000 });
    return res.data?.commentary || null;
  } catch (err) {
    console.warn('資金流向 AI 摘要取得失敗', err);
    return null;
  }
};

/**
 * 直接讀 Firestore 上後端抓好的個股原始資料。
 *
 * 後端的 /api/raw-data 本來就是「先看 raw_data_cache 有沒有新鮮的，沒有才去
 * 打 9 份 FinMind」。既然資料就在 Firestore，快取新鮮時繞過後端直接讀，
 * 等於省掉一整輪的冷啟動 + 網路往返。
 *
 * 回傳 null 代表沒有可用的快取，呼叫端要退回 API。
 */
const readRawDataCache = async (stockId) => {
  try {
    const { db, doc, getDoc } = await getFirestoreClient();
    const snap = await getDoc(doc(db, 'raw_data_cache', stockId));
    if (!snap.exists()) return null;
    const content = snap.data();
    if (!isCacheFresh(content.updated_at)) return null;
    const payload = content.payload;
    // 沒有價格資料的 payload 分析不出東西，當成沒有快取
    if (!payload?.price_data?.length) return null;
    return payload;
  } catch (err) {
    console.warn('raw_data_cache 讀取失敗，改打 API', err);
    return null;
  }
};

export const analyzeStockRaw = async (query) => {
  const q = query.trim();
  let payload = null;

  // 只有「看起來是代號」才查得動快取文件（文件 id 就是代號）。
  // 中文名稱要靠後端的 resolve_stock_id()，那條路仍走 API。
  if (looksLikeStockId(q)) {
    payload = await readRawDataCache(q);
    if (payload) {
      // 快取裡沒有 intraday（後端是每次請求才現抓並合併），用已搬到
      // Vercel Function 的即時報價補上，不必為此叫醒 Render。
      const quotes = await getQuotes([q]).catch(() => ({}));
      payload = { ...payload, intraday: quoteToIntraday(quotes[q]) };
    }
  }

  if (!payload) {
    // 後端一次性回傳所需的全部歷史資料（FinMind 請求與快取都在後端做）
    const res = await api.get(`/api/raw-data/${q}`);
    payload = res.data;
  }

  // 分析器只有這條路徑會用到，動態載入讓它不進其他頁面的首包。
  const { analyzeStockData } = await import('../utils/analyzer');
  const analysisResult = analyzeStockData(payload);

  if (analysisResult.error) {
    throw new Error(analysisResult.error);
  }

  // 模擬 Axios 回傳格式以相容既有 UI
  return { data: analysisResult };
};

export default api;
