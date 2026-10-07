/**
 * 驗證統計裁決。分兩層測：
 *   1. judgeReturns：直接餵「每筆報酬」陣列，報酬分布是構造出來的，
 *      所以每個情境的正確答案由統計性質決定，與 CDP 幾何無關。
 *   2. backtestCdpDayTrade：確認進出場抽取與既有欄位沒壞。
 */
import { backtestCdpDayTrade, judgeReturns, VERDICT, VERDICT_LABEL } from '../src/utils/backtest.js';

let fail = 0;
const show = (label, got, want, extra = '') => {
  const ok = got === want;
  if (!ok) fail++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label.padEnd(32)} → ${(VERDICT_LABEL[got] || got).padEnd(6)}${ok ? '' : ` （預期 ${VERDICT_LABEL[want]}）`}  ${extra}`);
};

/** 造 n 筆、平均 mean、標準差 sd 的報酬（決定性：用等距分位點，不靠亂數）。 */
function series(n, mean, sd) {
  const out = [];
  for (let i = 0; i < n; i++) {
    // 對稱鋸齒讓平均與標準差都可控且可重現
    const z = ((i % 2 === 0 ? 1 : -1) * (1 + (i % 5))) / 3;
    out.push(mean + z * sd);
  }
  const m = out.reduce((s, v) => s + v, 0) / n;
  return out.map(v => v - m + mean);   // 校正到目標平均
}
const stat = r => `n=${r.significance.n} 每筆=${r.significance.mean}% p=${r.significance.pValueT < 1e-4 ? r.significance.pValueT.toExponential(1) : r.significance.pValueT.toFixed(3)}`;

console.log('── judgeReturns（裁決決策樹）──');

// A. 樣本不足：即使每筆穩賺，12 筆就是分不出優勢與運氣
let r = judgeReturns(series(12, 2.0, 0.3));
show('12 筆、穩賺 2%', r.verdict.level, VERDICT.INSUFFICIENT, `${stat(r)} 需≈${r.needSamples} 筆`);

// B. 樣本足夠但期望為負 → 賭博（不是「還沒遇到好行情」）
r = judgeReturns(series(60, -0.8, 2.0));
show('60 筆、期望 -0.8%', r.verdict.level, VERDICT.GAMBLING, stat(r));

// C. 帳面微正、雜訊大 → 無法排除運氣
r = judgeReturns(series(60, 0.2, 8.0));
show('60 筆、+0.2% 但 sd=8%', r.verdict.level, VERDICT.LUCK_SUSPECTED, stat(r));
const ciCoversZero = r.significance.ciLow <= 0 && r.significance.ciHigh >= 0;
console.log(`${ciCoversZero ? 'PASS' : 'FAIL'}  ${'  └ 信賴區間涵蓋 0'.padEnd(32)} → [${r.significance.ciLow}%, ${r.significance.ciHigh}%]`);
if (!ciCoversZero) fail++;

// D. 前段強、後段崩 → 脆弱優勢（樣本內顯著但樣本外站不住）
r = judgeReturns([...series(42, 3.0, 0.8), ...series(18, -0.4, 0.8)]);
show('前 42 筆 +3%、後 18 筆 -0.4%', r.verdict.level, VERDICT.FRAGILE_EDGE,
  `衰減=${Math.round(r.holdout.degradation * 100)}% 樣本外=${r.holdout.outMean}%`);

// E. 全程穩定正期望 → 具統計優勢
r = judgeReturns(series(60, 1.5, 1.0));
show('60 筆、穩定 +1.5%', r.verdict.level, VERDICT.STATISTICAL_EDGE,
  `${stat(r)} 樣本外=${r.holdout.outMean}%`);

// F. 負期望不給所需樣本量（再多筆也驗證不出優勢）
r = judgeReturns(series(60, -0.8, 2.0));
console.log(`${r.needSamples === null ? 'PASS' : 'FAIL'}  ${'負期望的 needSamples 為 null'.padEnd(32)} → ${r.needSamples}`);
if (r.needSamples !== null) fail++;

// G. 邊界：空陣列與單筆不可丟錯
for (const [label, input] of [['空陣列', []], ['單筆', [5]]]) {
  try {
    const x = judgeReturns(input);
    console.log(`PASS  ${('邊界：' + label).padEnd(32)} → ${VERDICT_LABEL[x.verdict.level]}`);
  } catch (e) { fail++; console.log(`FAIL  邊界：${label} 丟錯 ${e.message}`); }
}

console.log('\n── backtestCdpDayTrade（進出場抽取 + 既有欄位）──');
// 造一段每天都會觸發 CDP 進場的日 K
function makeBars(n) {
  const bars = [{ date: '2026-01-01', open: 100, high: 102, low: 98, close: 100 }];
  for (let i = 1; i <= n; i++) {
    const p = bars[i - 1];
    const cdp = (p.high + p.low + 2 * p.close) / 4;
    const nl = 2 * cdp - p.high;
    const open = nl * 1.004, low = nl * 0.999, close = nl * 1.02;
    bars.push({ date: `2026-02-${String(1 + (i % 28)).padStart(2, '0')}`, open, high: Math.max(open, close), low, close });
  }
  return bars;
}
const bt = backtestCdpDayTrade(makeBars(50), 60);
const legacy = ['days', 'trades', 'winRate', 'avgReturn', 'cumReturn', 'worst'];
const missing = legacy.filter(k => bt[k] === undefined);
console.log(`${missing.length === 0 ? 'PASS' : 'FAIL'}  ${'保留既有欄位'.padEnd(32)} → ${legacy.map(k => `${k}=${bt[k]}`).join(' ')}`);
if (missing.length) fail++;
console.log(`${bt.verdict ? 'PASS' : 'FAIL'}  ${'附帶統計裁決'.padEnd(32)} → ${VERDICT_LABEL[bt.verdict.level]}`);
if (!bt.verdict) fail++;

const nullCase = backtestCdpDayTrade([{ date: 'a', open: 1, high: 1, low: 1, close: 1 }], 60);
console.log(`${nullCase === null ? 'PASS' : 'FAIL'}  ${'無觸發回傳 null'.padEnd(32)} → ${nullCase}`);
if (nullCase !== null) fail++;

const b = makeBars(50);
const x = backtestCdpDayTrade(b, 60), y = backtestCdpDayTrade(b, 60);
const stable = x.significance.pValueBootstrap === y.significance.pValueBootstrap;
console.log(`${stable ? 'PASS' : 'FAIL'}  ${'重複呼叫 p 值完全相同'.padEnd(32)} → ${x.significance.pValueBootstrap}`);
if (!stable) fail++;

console.log(`\n${fail === 0 ? '✅ 統計裁決全部符合預期' : `❌ ${fail} 項失敗`}`);
process.exit(fail ? 1 : 0);
