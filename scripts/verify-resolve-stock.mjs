/**
 * 驗證 src/utils/resolveStock.js —— 前端的代號/名稱解析。
 *
 * 用真實的 src/assets/stock_names.json（2367 檔）測，並逐項與後端
 * data_fetcher.resolve_stock_id() 的邏輯比對：
 *     1. query 是代號 → 直接回
 *     2. 名稱完全相同 → 回對應代號
 *     3. 部分比對 → 回一個包含該關鍵字的名稱的代號
 *     4. 都沒有 → null（呼叫端退回後端）
 *
 * 第 3 步刻意與後端不同：後端取「迭代到的第一筆」，順序取決於 TWSE API
 * 的回傳順序（任意）；這裡取「最短的符合名稱，同長度比代號」，結果穩定。
 * 測試確認的是「有找到且確實包含關鍵字」，以及我們的規則本身可重現。
 */
import { readFileSync } from 'node:fs';
// 刻意測 resolveFromMap（純函式）而不是 resolveStockId：後者會動態 import
// JSON，那需要打包器支援（Node 的 ESM 要 import attribute）。對照表的
// 動態載入與 tree-shaking 由建置輸出驗證（見檔尾說明）。
import { resolveFromMap, looksLikeStockId, loadNameMap } from '../src/utils/resolveStock.js';

const raw = JSON.parse(readFileSync('src/assets/stock_names.json', 'utf8'));
const nameMap = raw.name_map;
const idMap = raw.id_map;

let fail = 0;
const t = (n, ok, extra = '') => { if (!ok) fail++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${n.padEnd(40)} ${extra}`); };

console.log(`── 對照表：${Object.keys(nameMap).length} 檔 ──`);

console.log('\n── 代號直接回（不需要載對照表）──');
for (const q of ['2330', '2317', '00878', '6488']) {
  t(`代號 ${q}`, resolveFromMap(nameMap, q) === q, `→ ${resolveFromMap(nameMap, q)}`);
}
t('代號辨識不含非法輸入', !looksLikeStockId('../etc') && !looksLikeStockId('台積電') && !looksLikeStockId('123'));

console.log('\n── 名稱完全相同 ──');
for (const name of ['台積電', '鴻海', '聯發科', '長榮', '中鋼', '元大台灣50']) {
  const want = nameMap[name];
  if (!want) { console.log(`SKIP  對照表沒有「${name}」`); continue; }
  const got = resolveFromMap(nameMap, name);
  t(`「${name}」`, got === want, `→ ${got}`);
}

console.log('\n── 部分比對：必須回一個真的包含關鍵字的名稱 ──');
for (const q of ['台積', '聯發', '台塑', '富邦台']) {
  const got = resolveFromMap(nameMap, q);
  const matchedName = Object.keys(nameMap).find((n) => nameMap[n] === got);
  const ok = got !== null && matchedName?.includes(q);
  t(`「${q}」`, ok, `→ ${got}（${matchedName}）`);
}

console.log('\n── 與後端邏輯的等價性（前兩步必須完全一致）──');
{
  // 後端：query in id_map → query；query in name_map → name_map[query]
  const backendExact = (q) => (q in idMap ? q : (q in nameMap ? nameMap[q] : undefined));
  const samples = [...Object.keys(idMap).slice(0, 300), ...Object.keys(nameMap).slice(0, 300)];
  let mismatch = 0, checked = 0;
  for (const q of samples) {
    const want = backendExact(q);
    if (want === undefined) continue;
    checked++;
    const got = resolveFromMap(nameMap, q);
    if (got !== want) { mismatch++; if (mismatch <= 3) console.log(`      差異：${q} → JS=${got} Py=${want}`); }
  }
  t(`${checked} 筆代號/完全相同名稱`, mismatch === 0, mismatch === 0 ? '全部一致' : `${mismatch} 筆不一致`);
}

console.log('\n── 查不到要回 null（讓呼叫端退回後端）──');
for (const q of ['這間公司不存在', 'zzzz', '', '   ', null, undefined]) {
  const got = resolveFromMap(nameMap, q);
  t(`${JSON.stringify(q)}`, got === null, `→ ${got}`);
}

console.log('\n── 結果必須可重現（同輸入同輸出）──');
{
  const a = resolveFromMap(nameMap, '台積');
  const b = resolveFromMap(nameMap, '台積');
  t('重複呼叫結果相同', a === b, `${a} / ${b}`);
}

console.log('\n── 對照表只載一次 ──');
{
  const p1 = loadNameMap(), p2 = loadNameMap();
  t('共用同一個 promise', p1 === p2);
}

console.log('\n── 建置輸出：對照表必須是獨立 chunk 且搖掉 industry ──');
{
  // 這段驗證 resolveFromMap 測不到的部分：動態匯入有沒有真的分包、
  // 357 kB 的 JSON 有沒有誤入首包、佔 75% 的 industry 有沒有被搖掉。
  // 需要先跑過 npm run build；沒有 dist/ 就跳過。
  const { existsSync, readdirSync, statSync } = await import('node:fs');
  const { gzipSync } = await import('node:zlib');
  if (!existsSync('dist/assets')) {
    console.log('SKIP  沒有 dist/，先執行 npm run build');
  } else {
    const files = readdirSync('dist/assets').filter((f) => f.endsWith('.js'));
    const holders = files.filter((f) => readFileSync(`dist/assets/${f}`, 'utf8').includes('土銀富邦R1'));
    t('對照表只出現在一個 chunk', holders.length === 1, holders.join(', ') || '（找不到）');
    if (holders.length === 1) {
      const body = readFileSync(`dist/assets/${holders[0]}`, 'utf8');
      const kb = (statSync(`dist/assets/${holders[0]}`).size / 1024).toFixed(0);
      const gz = (gzipSync(body).length / 1024).toFixed(0);
      t('industry 已被 tree-shaking 搖掉', !body.includes('受益證券'), `chunk ${kb} kB raw / ${gz} kB gzip`);
      // index.html 只會 preload 首包需要的東西，對照表不該在裡面
      const html = readFileSync('dist/index.html', 'utf8');
      t('對照表不在首包的 preload 清單', !html.includes(holders[0]));
    }
  }
}

console.log(`\n${fail === 0 ? '✅ 解析行為正確且與後端前兩步一致' : `❌ ${fail} 項失敗`}`);
process.exit(fail ? 1 : 0);
