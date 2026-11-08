/**
 * 前端 src/utils/pring.js 與後端 src/backend/pring.py 必須算出一樣的結果。
 *
 * 用固定亂數種子造幾百組 K 線（長度 30～300、含橫盤、爆量、零量），同時餵兩邊，
 * 逐項比對每個檢核項的多空判定與說明文字、總結與給 AI 的摘要。
 *
 * 用法：node scripts/verify-pring-parity.mjs   （需要 python3）
 */
import { execFileSync } from 'node:child_process';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { evaluatePring } from '../src/utils/pring.js';

let seed = 20261108;
const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
const round2 = (v) => Math.round(v * 100) / 100;

const cases = [];
for (let t = 0; t < 300; t++) {
  const n = 30 + Math.floor(rnd() * 271);
  const drift = (rnd() - 0.5) * 0.004;
  let c = 10 + rnd() * 900;
  const bars = [];
  for (let i = 0; i < n; i++) {
    const flat = t % 25 === 0 && i < 40;            // 偶爾一段完全橫盤
    if (!flat) c *= 1 + drift + (rnd() - 0.5) * 0.06;
    const h = flat ? c : c * (1 + rnd() * 0.03), l = flat ? c : c * (1 - rnd() * 0.03);
    let v = Math.floor(rnd() * rnd() * 20000);
    if (rnd() < 0.02) v *= 6;                        // 爆量
    if (rnd() < 0.01) v = 0;                         // 零量
    bars.push({ date: `D${i}`, open: round2(c), high: round2(h), low: round2(l), close: round2(c), volume: v });
  }
  cases.push(bars);
}

const dir = mkdtempSync(join(tmpdir(), 'pring-'));
const inFile = join(dir, 'cases.json');
writeFileSync(inFile, JSON.stringify(cases));
const py = execFileSync('python3', ['-c', `
import json, sys
sys.path.insert(0, '.')
from src.backend.pring import evaluate_pring
cases = json.load(open(sys.argv[1]))
print(json.dumps([evaluate_pring(b) for b in cases], ensure_ascii=False))
`, inFile], { maxBuffer: 1 << 28 }).toString();
const pyRes = JSON.parse(py);

let fail = 0;
cases.forEach((bars, idx) => {
  const js = evaluatePring(bars), p = pyRes[idx];
  const diffs = [];
  if ((js === null) !== (p === null)) diffs.push('一邊是 null');
  else if (js) {
    if (js.overall !== p.overall) diffs.push(`overall JS=${js.overall} Py=${p.overall}`);
    js.items.forEach((it, k) => {
      if (it.stance !== p.items[k].stance) diffs.push(`${it.key} stance JS=${it.stance} Py=${p.items[k].stance}`);
      if (JSON.stringify(it.lines) !== JSON.stringify(p.items[k].lines)) diffs.push(`${it.key} 文字不同：\n    JS=${JSON.stringify(it.lines)}\n    Py=${JSON.stringify(p.items[k].lines)}`);
    });
    if (js.summary !== p.summary && !diffs.length) diffs.push('summary 不同');
  }
  if (diffs.length) { fail++; if (fail <= 5) console.log(`FAIL  case ${idx}（${bars.length} 根）\n  ${diffs.join('\n  ')}`); }
});
console.log(fail ? `\n❌ ${fail}/${cases.length} 組不一致` : `✅ ${cases.length} 組 K 線 JS 與 Python 結果完全一致`);
process.exit(fail ? 1 : 0);
