/**
 * 批次即時報價 — Vercel Function。
 *
 * GET /api/quotes?ids=2330,2317,2454  →  { "2330": { price, change_pct, ... }, ... }
 *
 * 為什麼搬到這裡：
 *   策略頁盤中每 15 秒要刷新報價，原本打 Render。Render 免費方案休眠後的冷啟動
 *   30-60 秒，等於「即時」報價可能等一分鐘。這支函式與前端同源部署在 Vercel，
 *   沒有長駐伺服器要喚醒。
 *
 * 刻意不用任何 npm 依賴（只用內建 fetch）：bundle 越小冷啟動越短，
 * 而這支要做的事就只是轉傳 + 整理證交所的即時快照。
 *
 * 資料源是證交所自家看盤網頁用的 MIS 快照（mis.twse.com.tw）。瀏覽器不能直接
 * 打它——沒有 CORS 標頭，而且需要 Referer——所以才需要這一層同源代理。
 * 欄位語意與 src/backend/data_fetcher.py 的 get_twse_mis_quotes() 一致：
 *   c=代號 z=成交價(無成交為 "-") y=昨收 n=名稱 o/h/l=開高低 v=累積張數 d=日期
 */

// MIS 單次查詢建議控制在 100 檔以內，避免被拒或逾時
const CHUNK = 90;
// 前端最多一次要 60 檔；設上限避免被當成放大器濫用
const MAX_IDS = 60;
const UPSTREAM_TIMEOUT_MS = 8000;

const num = (v) => {
  if (v === undefined || v === null || v === '-' || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

/** 把 MIS 的一筆 msgArray 轉成前端要的形狀；資料不足回 null。 */
function toQuote(item) {
  const prevClose = num(item.y);
  const price = num(item.z) ?? prevClose;
  if (price === null || prevClose === null || prevClose <= 0) return null;
  const d = String(item.d || '');
  const lots = num(item.v) || 0;
  return {
    price: Math.round(price * 100) / 100,
    change_pct: Math.round(((price - prevClose) / prevClose) * 10000) / 100,
    prev_close: Math.round(prevClose * 100) / 100,
    name: item.n || '',
    open: num(item.o),
    high: num(item.h),
    low: num(item.l),
    // v 是累積成交量（張），轉成股數與其他資料源單位一致
    volume: Math.round(lots * 1000),
    date: d.length === 8 ? `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6)}` : null,
  };
}

async function fetchBatch(ids) {
  // 後端那邊靠股號對照表決定 tse_／otc_ 前綴，但這支函式沒有那份表。
  // 兩個前綴都問：MIS 只會回存在的頻道，多問的那個直接被忽略。
  const exCh = ids.flatMap((id) => [`tse_${id}.tw`, `otc_${id}.tw`]).join('|');
  const url = `https://mis.twse.com.tw/stock/api/getStockInfo.jsp?json=1&delay=0&ex_ch=${encodeURIComponent(exCh)}`;

  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0',
      // MIS 會檢查 Referer，少了這個會被擋
      Referer: 'https://mis.twse.com.tw/stock/index.jsp',
    },
    signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`MIS 回應 ${res.status}`);

  const body = await res.json();
  const out = {};
  for (const item of body.msgArray || []) {
    const sid = item.c;
    if (!sid) continue;
    const q = toQuote(item);
    // 同一代號可能從 tse_/otc_ 各回一筆，先到的（有成交價的）優先
    if (q && !out[sid]) out[sid] = q;
  }
  return out;
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const raw = (req.query?.ids ?? '').toString();
  const ids = [...new Set(
    raw.split(',')
      .map((s) => s.trim())
      // 只放行台股代號的字元，避免把任意字串往上游送
      .filter((s) => /^[0-9A-Z]{4,6}$/.test(s)),
  )].slice(0, MAX_IDS);

  if (ids.length === 0) return res.status(200).json({});

  const quotes = {};
  const failures = [];
  for (let i = 0; i < ids.length; i += CHUNK) {
    const batch = ids.slice(i, i + CHUNK);
    try {
      Object.assign(quotes, await fetchBatch(batch));
    } catch (err) {
      // 一批失敗不該讓整個請求失敗：拿到幾檔就先回幾檔，
      // 前端只會覆蓋拿到報價的那幾張卡片。
      failures.push(err.message);
    }
  }

  if (Object.keys(quotes).length === 0 && failures.length > 0) {
    return res.status(502).json({ error: '上游即時報價暫時無法取得', detail: failures[0] });
  }

  // 盤中 10 秒內的重複請求直接吃 CDN 快取，不必再打上游。
  // stale-while-revalidate 讓快取過期的那一刻也不會有人等。
  res.setHeader('Cache-Control', 'public, s-maxage=10, stale-while-revalidate=30');
  return res.status(200).json(quotes);
}
