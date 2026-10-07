/**
 * 把 src/utils/significance.js 的輸出逐項對照 Python 原版
 * （反詐投資王 core/verdict/statistics.py）產生的黃金向量。
 *
 * 決定性的部分（t 分布尾端機率、不完全 beta、所需樣本量、平均、標準差）
 * 要求數值吻合到 1e-9；bootstrap 的 p 值與信賴區間用的是不同語言的 PRNG，
 * 無法位元相同，只檢查落在蒙地卡羅誤差內。
 *
 * 用法：node scripts/verify-significance.mjs <golden.json>
 */
import { readFileSync } from 'node:fs';
import {
  regIncompleteBeta, studentTSf, testExpectancyPositive, requiredSampleSize,
} from '../src/utils/significance.js';

const golden = JSON.parse(readFileSync(process.argv[2], 'utf8'));
let pass = 0, fail = 0;
const near = (got, want, tol) => Math.abs(got - want) <= tol;
function check(label, got, want, tol = 1e-9) {
  const ok = (got === null && want === null) || (Number.isFinite(got) && Number.isFinite(want) && near(got, want, tol)) || got === want;
  if (ok) pass++; else { fail++; console.log(`  FAIL ${label}: got=${got} want=${want}`); }
}

console.log('── 正則化不完全 beta I_x(a,b) ──');
for (const v of golden.reg_incomplete_beta) check(`I_${v.x}(${v.a},${v.b})`, regIncompleteBeta(v.x, v.a, v.b), v.want);

console.log('── Student-t 單尾存活函數 ──');
let worst = 0;
for (const v of golden.student_t_sf) {
  const got = studentTSf(v.t, v.df);
  worst = Math.max(worst, Math.abs(got - v.want));
  check(`sf(t=${v.t}, df=${v.df})`, got, v.want);
}
console.log(`  最大絕對誤差 = ${worst.toExponential(2)}`);

console.log('── 期望值檢定（決定性部分）──');
for (const v of golden.expectancy) {
  const r = testExpectancyPositive(v.pnls);
  check(`${v.name}.n`, r.n, v.n);
  check(`${v.name}.mean`, r.mean, v.mean);
  check(`${v.name}.std`, r.std, v.std);
  check(`${v.name}.pValueT`, r.pValueT, v.p_value_t);
  if (v.t_stat !== null) check(`${v.name}.tStat`, r.tStat, v.t_stat);
}

console.log('── 期望值檢定（bootstrap：蒙地卡羅誤差內）──');
for (const v of golden.expectancy) {
  const r = testExpectancyPositive(v.pnls);
  // B=5000 時 p 的標準誤最大約 0.007；取 5 個標準誤 + 下限保護
  const tol = Math.max(0.04, 5 * Math.sqrt((v.p_value_bootstrap * (1 - v.p_value_bootstrap)) / 5000));
  check(`${v.name}.pBoot`, r.pValueBootstrap, v.p_value_bootstrap, tol);
  // CI 端點容忍到樣本標準差的 15%
  const ciTol = Math.max(0.05, 0.15 * (v.std || 1));
  check(`${v.name}.ciLow`, r.ciLow, v.ci_low, ciTol);
  check(`${v.name}.ciHigh`, r.ciHigh, v.ci_high, ciTol);
  check(`${v.name}.isSignificant`, r.isSignificant, v.is_significant);
}

console.log('── 所需樣本量 ──');
for (const v of golden.need_n) check(`${v.name}`, requiredSampleSize(v.pnls), v.want);

console.log(`\n${fail === 0 ? '✅' : '❌'} ${pass} 項通過${fail ? `，${fail} 項失敗` : ''}`);
process.exit(fail ? 1 : 0);
