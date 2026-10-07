/**
 * 個股原始資料的新鮮度判斷 —— 與後端 web_app.get_raw_data() 的 TTL 一致。
 *
 * 後端把抓好的 FinMind 資料存在 Firestore 的 raw_data_cache/{stock_id}，
 * 形狀是 { payload, updated_at(ISO 字串) }，盤中 30 分鐘、盤後 4 小時到期。
 * 既然資料就在 Firestore，瀏覽器沒有理由繞過它去打後端再等一次冷啟動——
 * 快取還新鮮時直接讀，就是最快的那條路。
 *
 * 這支只做「判斷能不能用」，刻意不碰讀取與 Firebase SDK，方便離線測試。
 */

// 與後端 get_raw_data() 的 cache_ttl 相同
const TTL_MARKET_HOURS_MS = 30 * 60 * 1000;
const TTL_OFF_HOURS_MS = 4 * 60 * 60 * 1000;

/**
 * 台股盤中時段（週一至週五 09:00–13:30，台北時間）。
 * 刻意用台北時區換算而不是使用者的本機時區：使用者可能在任何時區，
 * 用本機時間判斷會在海外得到完全錯誤的 TTL。
 */
export function isMarketHours(now = new Date()) {
  // 取台北時間的星期與時分（en-CA 給 YYYY-MM-DD，方便解析）
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Taipei',
    weekday: 'short', hour: '2-digit', minute: '2-digit', hour12: false,
  });
  const parts = Object.fromEntries(fmt.formatToParts(now).map(p => [p.type, p.value]));
  const weekday = parts.weekday;           // Mon / Tue / ...
  if (weekday === 'Sat' || weekday === 'Sun') return false;
  const minutes = Number(parts.hour) * 60 + Number(parts.minute);
  return minutes >= 9 * 60 && minutes < 13 * 60 + 30;
}

/** 這份快取還能用嗎？ */
export function isCacheFresh(updatedAt, now = new Date()) {
  if (!updatedAt) return false;
  const t = new Date(updatedAt);
  if (Number.isNaN(t.getTime())) return false;
  const age = now.getTime() - t.getTime();
  // 時間戳在未來（時鐘偏差）就不要信
  if (age < 0) return false;
  return age < (isMarketHours(now) ? TTL_MARKET_HOURS_MS : TTL_OFF_HOURS_MS);
}

/**
 * 看起來像台股代號嗎？只有代號才有辦法直接查快取文件；
 * 中文名稱之類的要靠後端的 resolve_stock_id()，那條路仍走 API。
 */
export const looksLikeStockId = (q) => /^[0-9]{4,6}[A-Z]?$/.test(String(q || '').trim());

/**
 * 把即時報價組成 analyzer 需要的 intraday 形狀。
 *
 * 後端的 intraday 還有 yesterday_high / yesterday_low / cdp_base_date，
 * 來源是官方日線快取而不是即時報價。analyzer 的 calculateCdp() 對這三個欄位
 * 是選配的——缺了就用 price_data 的日線序列算 CDP，而那本來就是正確的 T-1 資料。
 * 所以這裡只補報價能提供的部分。
 */
export function quoteToIntraday(quote) {
  if (!quote || !(quote.price > 0)) return {};
  return {
    price: quote.price,
    open: quote.open ?? null,
    volume: quote.volume ?? 0,
    yesterday_close: quote.prev_close ?? null,
  };
}
