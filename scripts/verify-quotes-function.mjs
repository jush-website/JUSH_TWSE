/**
 * 驗證 api/quotes.js 的邏輯。mis.twse.com.tw 在這個沙箱連不到，
 * 所以把 global.fetch 換成假的上游，專注測我們自己寫的部分：
 * 代號過濾、MIS 欄位轉換、分批、部分失敗的降級、快取標頭。
 */
import handler from '../api/quotes.js';

let fail = 0;
const t = (name, ok, extra = '') => { if (!ok) fail++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}  ${extra}`); };

/** 假的 res 物件，記錄 status/headers/body */
function mockRes() {
  const r = { statusCode: null, headers: {}, body: undefined };
  r.setHeader = (k, v) => { r.headers[k.toLowerCase()] = v; };
  r.status = (c) => { r.statusCode = c; return r; };
  r.json = (b) => { r.body = b; return r; };
  return r;
}

const realFetch = global.fetch;
/** 讓 fetch 回傳指定的 msgArray；同時記錄被請求的 URL */
function stubFetch({ msgArray = [], ok = true, status = 200, throws = null } = {}) {
  const calls = [];
  global.fetch = async (url, opts) => {
    calls.push({ url, headers: opts?.headers });
    if (throws) throw new Error(throws);
    return { ok, status, json: async () => ({ msgArray }) };
  };
  return calls;
}

// ── 1. 正常：MIS 欄位正確轉換 ──
let calls = stubFetch({ msgArray: [
  { c: '2330', z: '1105.0', y: '1090.0', n: '台積電', o: '1095', h: '1110', l: '1092', v: '25000', d: '20261007' },
  { c: '6488', z: '-', y: '420.5', n: '環球晶', o: '-', h: '-', l: '-', v: '0', d: '20261007' },
]});
let res = mockRes();
await handler({ method: 'GET', query: { ids: '2330,6488' } }, res);
t('正常請求回 200', res.statusCode === 200);
t('成交價與漲跌幅換算正確', res.body['2330'].price === 1105 && res.body['2330'].change_pct === 1.38,
  `price=${res.body['2330'].price} change=${res.body['2330'].change_pct}%`);
t('張數轉股數', res.body['2330'].volume === 25000000, `volume=${res.body['2330'].volume}`);
t('日期格式化', res.body['2330'].date === '2026-10-07', res.body['2330'].date);
t('尚無成交時用昨收當價格', res.body['6488'].price === 420.5 && res.body['6488'].change_pct === 0,
  `price=${res.body['6488'].price}`);
t('同時查 tse_ 與 otc_ 兩個前綴', calls[0].url.includes('tse_2330.tw') && calls[0].url.includes('otc_2330.tw'));
t('帶上 MIS 需要的 Referer', calls[0].headers.Referer === 'https://mis.twse.com.tw/stock/index.jsp');
t('設定 CDN 快取標頭', /s-maxage=10/.test(res.headers['cache-control']), res.headers['cache-control']);

// ── 2. 代號過濾：不把任意字串往上游送 ──
calls = stubFetch({ msgArray: [] });
res = mockRes();
await handler({ method: 'GET', query: { ids: '2330, ../etc/passwd ,<script>,2317,2330' } }, res);
const sent = calls[0]?.url ?? '';
t('過濾掉非法代號', !sent.includes('passwd') && !sent.includes('script'), decodeURIComponent(sent).slice(-40));
t('去除重複代號', (decodeURIComponent(sent).match(/tse_2330\.tw/g) || []).length === 1);

// ── 3. 空 ids 直接回空物件，不打上游 ──
calls = stubFetch({ msgArray: [] });
res = mockRes();
await handler({ method: 'GET', query: { ids: '' } }, res);
t('空 ids 回 {} 且不打上游', res.statusCode === 200 && Object.keys(res.body).length === 0 && calls.length === 0);

// ── 4. 上游全失敗 → 502，但不是 500 爆掉 ──
stubFetch({ throws: 'ECONNRESET' });
res = mockRes();
await handler({ method: 'GET', query: { ids: '2330' } }, res);
t('上游失敗回 502', res.statusCode === 502, JSON.stringify(res.body));

// ── 5. 分批：超過 90 檔要分多次請求 ──
const many = Array.from({ length: 60 }, (_, i) => String(1101 + i)).join(',');
calls = stubFetch({ msgArray: [] });
res = mockRes();
await handler({ method: 'GET', query: { ids: many } }, res);
t('60 檔一次請求打完', calls.length === 1, `請求數=${calls.length}`);

// ── 6. 超過上限要截斷 ──
const tooMany = Array.from({ length: 200 }, (_, i) => String(1101 + i)).join(',');
calls = stubFetch({ msgArray: [] });
res = mockRes();
await handler({ method: 'GET', query: { ids: tooMany } }, res);
const idCount = (decodeURIComponent(calls[0].url).match(/tse_/g) || []).length;
t('超過 60 檔截斷', idCount === 60, `實際送出 ${idCount} 檔`);

// ── 7. 非 GET 回 405 ──
res = mockRes();
await handler({ method: 'POST', query: {} }, res);
t('POST 回 405', res.statusCode === 405 && res.headers.allow === 'GET');

global.fetch = realFetch;
console.log(`\n${fail === 0 ? '✅ quotes function 全部符合預期' : `❌ ${fail} 項失敗`}`);
process.exit(fail ? 1 : 0);
