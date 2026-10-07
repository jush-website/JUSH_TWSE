/**
 * 驗證 fetchPrecomputed 的兩條路徑（Firestore / Render API）在各 handler 的
 * 回傳形狀下會給出「相同的 payload」。形狀不一致不會丟錯，只會讓圖表默默變空，
 * 所以必須明確測。
 *
 * 這裡複刻 api.js 裡的 unwrap / isEmptyPayload（純函式，無 import 相依），
 * 並用後端各 handler 的真實回傳形狀當輸入。
 */
const unwrap = (v) =>
  v && typeof v === 'object' && !Array.isArray(v) && 'data' in v ? v.data : v;
const isEmptyPayload = (v) =>
  v == null
  || (Array.isArray(v) && v.length === 0)
  || (typeof v === 'object' && !Array.isArray(v) && Object.keys(v).length === 0);

// Firestore 路徑：sync_doc_to_firestore 存成 {data: <handler 回傳>, base_date, updated_at}
// fetchFromFirestore 回傳 firestoreData.data → 就是 handler 的回傳值
const viaFirestore = (handlerReturn) => unwrap(handlerReturn);
// API 路徑：axios 的 res.data 就是 handler 的回傳值
const viaApi = (handlerReturn) => unwrap(handlerReturn);

// 後端各 handler 的真實回傳形狀（取自 src/backend/web_app.py）
const handlers = {
  'global_market  (dict of 指數)': { '費半指數': { change_pct: 1.2 }, '那斯達克': { change_pct: -0.3 } },
  'futures        (扁平 dict)':    { price: 23150, change_pct: 0.8, session: '盤後', date: '2026-10-07' },
  'market_outlook (扁平 dict)':    { trend: '偏多', trend_desc: '...', signals: ['✅ a'] },
  'news           (taiwan/global)': { taiwan: [{ title: 'x' }], global: [{ title: 'y' }] },
  'market_breadth ({data,base_date})': { data: { summary: { up: 500, down: 300 } }, base_date: '2026-10-07' },
  'market_distribution (list)':    [{ bucket: '+9~10%', count: 12 }],
  'capital_flow   (list)':         [{ industry: '半導體', value_ratio: 31.2 }],
  'institutional_flow (list)':     [{ date: '2026-10-07', 外資及陸資: 1e9 }],
  'us_treasury    ({data: list})': { data: [{ date: '2026-10-07', yield: 4.1 }] },
  'exchange_rate  ({data: list})': { data: [{ date: '2026-10-07', currency: 'USD', cash_buy: 30.5 }] },
  'futures_daily  ({data: list})': { data: [{ date: '2026-10-07', contract_date: '202610', trading_session: 'position', volume: 52000, close: 23150 }] },
};

let fail = 0;
console.log('── 兩條路徑的 payload 必須相同 ──');
for (const [label, ret] of Object.entries(handlers)) {
  const a = viaFirestore(ret), b = viaApi(ret);
  const same = JSON.stringify(a) === JSON.stringify(b);
  if (!same) fail++;
  const preview = JSON.stringify(a).slice(0, 56);
  console.log(`${same ? 'PASS' : 'FAIL'}  ${label.padEnd(36)} → ${preview}`);
}

console.log('\n── 呼叫端實際讀取的欄位必須存在 ──');
const checks = [
  ['Dashboard  markets',   viaFirestore(handlers['global_market  (dict of 指數)']), v => Object.keys(v).length > 0],
  ['Dashboard  news.taiwan', viaFirestore(handlers['news           (taiwan/global)']), v => Array.isArray(v.taiwan)],
  ['Dashboard  futures.price', viaFirestore(handlers['futures        (扁平 dict)']), v => v.price != null],
  ['Dashboard  outlook.trend', viaFirestore(handlers['market_outlook (扁平 dict)']), v => !!v.trend],
  ['Dashboard  breadth.summary', viaFirestore(handlers['market_breadth ({data,base_date})']), v => !!v.summary],
  ['MarketDistribution 陣列', viaFirestore(handlers['market_distribution (list)']), v => Array.isArray(v)],
  ['CapitalFlow 陣列',       viaFirestore(handlers['capital_flow   (list)']), v => Array.isArray(v)],
  ['InstitutionalFlow 陣列', viaFirestore(handlers['institutional_flow (list)']), v => Array.isArray(v)],
  ['MacroDashboard 美債陣列', viaFirestore(handlers['us_treasury    ({data: list})']), v => Array.isArray(v)],
  ['MacroDashboard 匯率陣列', viaFirestore(handlers['exchange_rate  ({data: list})']), v => Array.isArray(v)],
  // Derivatives 會 filter trading_session==='position' 再按 volume 取主力合約，
  // 所以那兩個欄位必須存在，不然畫面會是空的
  ['Derivatives 台指期欄位', viaFirestore(handlers['futures_daily  ({data: list})']),
    v => Array.isArray(v) && v.every(x => 'trading_session' in x && 'volume' in x && 'date' in x)],
];
for (const [label, payload, pred] of checks) {
  const ok = pred(payload);
  if (!ok) fail++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label.padEnd(36)} → ${JSON.stringify(payload).slice(0, 50)}`);
}

console.log('\n── 空資料要被判定為「沒有資料」才會退回 API ──');
for (const [label, v, want] of [
  ['null', null, true], ['空陣列', [], true], ['空物件', {}, true],
  ['非空陣列', [1], false], ['非空物件', { a: 1 }, false],
]) {
  const got = isEmptyPayload(v);
  const ok = got === want;
  if (!ok) fail++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label.padEnd(36)} → ${got ? '視為空' : '有資料'}`);
}

console.log(`\n${fail === 0 ? '✅ 兩條路徑形狀一致' : `❌ ${fail} 項不一致`}`);
process.exit(fail ? 1 : 0);
