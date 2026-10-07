/**
 * 端到端驗證：用真的 HTTP server 掛上 api/quotes.js，確認
 *   1. 函式能在 Node 的 http 環境下正常回應（不只是單元測試）
 *   2. vercel.json 的 rewrite 正則真的會放行 /api 而攔下其他路徑
 * 上游 MIS 在沙箱連不到，所以 fetch 仍然是假的。
 */
import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import handler from '../api/quotes.js';

let fail = 0;
const t = (n, ok, extra = '') => { if (!ok) fail++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}  ${extra}`); };

// ── 1. rewrite 正則：/api 要被放行，其他要落到 index.html ──
const cfg = JSON.parse(readFileSync('vercel.json', 'utf8'));
const src = cfg.rewrites[0].source;
const re = new RegExp(`^${src}$`);
console.log(`── vercel.json rewrite：${src} ──`);
for (const [path, shouldRewrite] of [
  ['/', true], ['/analyze', true], ['/recommendations/short-term', true],
  ['/api/quotes', false], ['/api/raw-data/2330', false],
]) {
  const matched = re.test(path);
  const ok = matched === shouldRewrite;
  if (!ok) fail++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${path.padEnd(30)} → ${matched ? '導向 index.html' : '交給 api/ 函式'}`);
}

// ── 2. 真的起一個 server 跑函式 ──
// 只攔上游 MIS，其他（包括這支測試自己對本機 server 的呼叫）照原樣走，
// 否則連自己的 server 都打不到。
const realFetch = global.fetch;
global.fetch = async (url, opts) => {
  if (String(url).includes('mis.twse.com.tw')) {
    return {
      ok: true, status: 200,
      json: async () => ({ msgArray: [
        { c: '2330', z: '1105.0', y: '1090.0', n: '台積電', o: '1095', h: '1110', l: '1092', v: '25000', d: '20261007' },
      ] }),
    };
  }
  return realFetch(url, opts);
};

const server = createServer(async (req, rawRes) => {
  const url = new URL(req.url, 'http://localhost');
  // 模擬 Vercel 提供的 req.query / res.status().json()
  const q = Object.fromEntries(url.searchParams);
  const res = {
    setHeader: (k, v) => rawRes.setHeader(k, v),
    status(c) { rawRes.statusCode = c; return this; },
    json(b) { rawRes.setHeader('content-type', 'application/json'); rawRes.end(JSON.stringify(b)); return this; },
  };
  await handler({ method: req.method, query: q }, res);
});
await new Promise(r => server.listen(0, r));
const port = server.address().port;
console.log(`\n── 實際 HTTP 呼叫（port ${port}）──`);

let r = await fetch(`http://localhost:${port}/api/quotes?ids=2330`);
let body = await r.json();
t('HTTP 200 且回傳正確報價', r.status === 200 && body['2330']?.price === 1105, JSON.stringify(body['2330']));
t('回傳 CDN 快取標頭', /s-maxage=10/.test(r.headers.get('cache-control') || ''), r.headers.get('cache-control'));

r = await fetch(`http://localhost:${port}/api/quotes`);
body = await r.json();
t('沒帶 ids 回空物件', r.status === 200 && Object.keys(body).length === 0);

r = await fetch(`http://localhost:${port}/api/quotes?ids=2330`, { method: 'POST' });
t('POST 回 405', r.status === 405);

server.close();
console.log(`\n${fail === 0 ? '✅ 路由與函式端到端通過' : `❌ ${fail} 項失敗`}`);
process.exit(fail ? 1 : 0);
