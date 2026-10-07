/**
 * 把 api/ai-commentary/[kind].js 送給 NVIDIA 的 prompt，與 Python 原版
 * （src/backend/ai_commentary.py 的 generate_*）逐字比對。
 *
 * 提示詞一字之差就可能讓輸出走鐘（字數上限、禁止事項、分段格式都寫在裡面），
 * 而這種分岔不會丟錯、只會讓解讀品質默默變差，所以必須機械比對。
 *
 * 黃金檔由 Python 端以假的 _call_nvidia 攔下 prompt 產生，見 scripts/README.md。
 * 用法：node scripts/verify-ai-prompts.mjs scripts/prompt-golden.json scripts/payloads.json
 */
import { readFileSync } from 'node:fs';
import handler from '../api/ai-commentary/[kind].js';

const golden = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const payloads = JSON.parse(readFileSync(process.argv[3], 'utf8'));

let fail = 0;
const t = (n, ok, extra = '') => { if (!ok) fail++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}  ${extra}`); };

function mockRes() {
  const r = { statusCode: null, headers: {}, body: undefined };
  r.setHeader = (k, v) => { r.headers[k.toLowerCase()] = v; };
  r.status = (c) => { r.statusCode = c; return r; };
  r.json = (b) => { r.body = b; return r; };
  return r;
}

/** 攔下送往 NVIDIA 的請求，取出 system / user / max_tokens。 */
function captureFetch(store) {
  global.fetch = async (url, opts) => {
    const body = JSON.parse(opts.body);
    store.push({
      url: String(url),
      auth: opts.headers?.Authorization,
      model: body.model,
      system: body.messages[0].content,
      user: body.messages[1].content,
      max_tokens: body.max_tokens,
      temperature: body.temperature,
    });
    return { ok: true, status: 200, json: async () => ({ choices: [{ message: { content: '  模擬輸出  ' } }] }) };
  };
}

/**
 * 整數值浮點數的呈現差異，JS 這端無法重現，必須正規化後再比。
 *
 * Python 的 json.loads("22.0") 得到 float 22.0，f-string 印成 "22.0"；
 * JS 的 JSON.parse("22.0") 得到 Number 22，樣板字串印成 "22"。小數點那位
 * 資訊在 JSON.parse 當下就沒了，所以 JS 端沒有任何辦法還原 —— 不是沒寫好，
 * 是做不到。
 *
 * 影響：prompt 裡會是「負債比 22%」而不是「負債比 22.0%」。語意完全相同，
 * 不改變模型的解讀。這裡把兩邊的 "N.0" 一律收斂成 "N" 再比對，所以真正的
 * 分岔（措辭、段落順序、漏掉某一節）仍然會被抓到。
 */
const normalizeFloats = (s) => s.replace(/(\d)\.0(?=\D|$)/g, '$1');

/** 顯示第一個不同的位置，方便定位分岔。 */
function firstDiff(a, b) {
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) if (a[i] !== b[i]) {
    return `第 ${i} 字不同：JS=${JSON.stringify(a.slice(i, i + 24))} Py=${JSON.stringify(b.slice(i, i + 24))}`;
  }
  return `長度不同：JS=${a.length} Py=${b.length}，尾端 JS=${JSON.stringify(a.slice(n, n + 24))} Py=${JSON.stringify(b.slice(n, n + 24))}`;
}

process.env.NVIDIA_API_KEY = 'dummy-for-prompt-capture';

console.log('── prompt 必須與 Python 原版逐字相同 ──');
for (const kind of Object.keys(golden)) {
  const calls = [];
  captureFetch(calls);
  const res = mockRes();
  await handler({ method: 'POST', query: { kind }, body: payloads[kind] }, res);

  if (calls.length !== 1) { fail++; console.log(`FAIL  ${kind}：預期打 1 次 NVIDIA，實際 ${calls.length} 次`); continue; }
  const got = calls[0], want = golden[kind];

  const sysOk = got.system === want.system;
  t(`${kind.padEnd(16)} system prompt`, sysOk, sysOk ? `${got.system.length} 字（逐字相同）` : firstDiff(got.system, want.system));
  const gu = normalizeFloats(got.user), wu = normalizeFloats(want.user);
  const userOk = gu === wu;
  t(`${kind.padEnd(16)} user prompt`, userOk, userOk ? `${got.user.length} 字（整數浮點呈現已正規化）` : firstDiff(gu, wu));
  t(`${kind.padEnd(16)} max_tokens`, got.max_tokens === want.max_tokens, `${got.max_tokens}`);
  t(`${kind.padEnd(16)} temperature`, got.temperature === want.temperature, `${got.temperature}`);
}

console.log('\n── 回應形狀與行為 ──');
{
  // 整合分析用 report，其餘用 commentary（必須與 web_app.py 的端點一致）
  for (const [kind, key] of [['stock-analysis', 'commentary'], ['integrated', 'report'],
                             ['market', 'commentary'], ['capital-flow', 'commentary']]) {
    captureFetch([]);
    const res = mockRes();
    await handler({ method: 'POST', query: { kind }, body: payloads[kind] }, res);
    t(`${kind.padEnd(16)} 回應欄位為 ${key}`, res.statusCode === 200 && key in res.body, JSON.stringify(res.body));
    t(`${kind.padEnd(16)} 輸出已 trim`, res.body[key] === '模擬輸出', JSON.stringify(res.body[key]));
  }
}
{
  // 沒有金鑰 → 安靜回 null，不是 500
  delete process.env.NVIDIA_API_KEY;
  const calls = []; captureFetch(calls);
  const res = mockRes();
  await handler({ method: 'POST', query: { kind: 'market' }, body: payloads.market }, res);
  t('無金鑰時回 null 且不打上游', res.statusCode === 200 && res.body.commentary === null && calls.length === 0);
  process.env.NVIDIA_API_KEY = 'dummy-for-prompt-capture';
}
{
  // 上游 429（額度用盡）→ null，不是錯誤
  global.fetch = async () => ({ ok: false, status: 429, json: async () => ({}) });
  const res = mockRes();
  await handler({ method: 'POST', query: { kind: 'market' }, body: payloads.market }, res);
  t('上游 429 回 null', res.statusCode === 200 && res.body.commentary === null);
}
{
  // 逾時 → null
  global.fetch = async () => { throw new Error('The operation was aborted due to timeout'); };
  const res = mockRes();
  await handler({ method: 'POST', query: { kind: 'market' }, body: payloads.market }, res);
  t('逾時回 null', res.statusCode === 200 && res.body.commentary === null);
}
{
  // 素材不足 → null，不白打 API
  const calls = []; captureFetch(calls);
  const res = mockRes();
  await handler({ method: 'POST', query: { kind: 'market' }, body: {} }, res);
  t('素材不足回 null 且不打上游', res.statusCode === 200 && res.body.commentary === null && calls.length === 0);
}
{
  const res = mockRes();
  await handler({ method: 'GET', query: { kind: 'market' }, body: {} }, res);
  t('GET 回 405', res.statusCode === 405);
}
{
  const res = mockRes();
  await handler({ method: 'POST', query: { kind: 'nope' }, body: {} }, res);
  t('未知種類回 404', res.statusCode === 404);
}
{
  const res = mockRes();
  await handler({ method: 'POST', query: { kind: 'market' }, body: 'not json' }, res);
  t('body 不是 JSON 回 400', res.statusCode === 400);
}
{
  // 金鑰絕對不能出現在回應裡
  captureFetch([]);
  const res = mockRes();
  await handler({ method: 'POST', query: { kind: 'market' }, body: payloads.market }, res);
  const dumped = JSON.stringify({ body: res.body, headers: res.headers });
  t('回應不含金鑰', !dumped.includes('dummy-for-prompt-capture'));
  t('不被瀏覽器快取', res.headers['cache-control'] === 'no-store', res.headers['cache-control']);
}

console.log(`\n${fail === 0 ? '✅ prompt 與行為全部一致' : `❌ ${fail} 項不一致`}`);
process.exit(fail ? 1 : 0);
