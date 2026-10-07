/**
 * 期望值顯著性檢定 —— 分辨「可重複的優勢」與「運氣」。
 *
 * 一個勝率 62%、平均每次 +1.8% 的回測看起來很漂亮，但如果樣本只有 13 筆，
 * 那串數字跟擲硬幣擲出 8 正 5 反沒什麼兩樣。這個模組的工作就是把
 * 「看起來賺」和「統計上站得住腳」分開。
 *
 * 作法沿用反詐投資王（Anti-Gambling Trader, MIT）的統計核心並移植為 JS：
 * https://github.com/mars-tw/anti-gambling-trader-tw
 *   core/verdict/statistics.py
 * 兩種互補的單尾檢定（p 值語意相同：**假設其實沒有優勢（H0）時，純靠抽樣
 * 波動出現至少這麼極端結果的機率**——不是「優勢為真的機率」）：
 *   1. t 檢定：用真正的 t 分布尾端機率（經正則化不完全 beta 函數）
 *   2. Bootstrap：把樣本平移到 H0（均值 0）後重抽（shift method），
 *      不假設分布，對偏態厚尾的損益特別重要
 * 兩者都過關才算顯著，刻意偏保守。
 *
 * 數值結果已逐項對照 Python 原版（見 scripts/verify-significance.mjs）。
 */

// 單尾 α=0.05 的常態分位數，與 80% 檢定力的分位數。
// 只用 z_alpha 等於只有約 50% 檢定力，會系統性低估所需樣本數。
const Z_ALPHA_ONE_SIDED = 1.6449;
const Z_POWER_80 = 0.8416;

/** 不完全 beta 函數的連分數展開（Lentz 演算法）。 */
function betacf(a, b, x, maxIter = 200, eps = 1e-12) {
  const tiny = 1e-30;
  const qab = a + b, qap = a + 1, qam = a - 1;
  let c = 1;
  let d = 1 - (qab * x) / qap;
  if (Math.abs(d) < tiny) d = tiny;
  d = 1 / d;
  let h = d;
  for (let m = 1; m <= maxIter; m++) {
    const m2 = 2 * m;
    let aa = (m * (b - m) * x) / ((qam + m2) * (a + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < tiny) d = tiny;
    c = 1 + aa / c;
    if (Math.abs(c) < tiny) c = tiny;
    d = 1 / d;
    h *= d * c;
    aa = (-(a + m) * (qab + m) * x) / ((a + m2) * (qap + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < tiny) d = tiny;
    c = 1 + aa / c;
    if (Math.abs(c) < tiny) c = tiny;
    d = 1 / d;
    const delta = d * c;
    h *= delta;
    if (Math.abs(delta - 1) < eps) break;
  }
  return h;
}

/** log Γ(x)：Lanczos 近似（JS 沒有內建 lgamma）。 */
function lgamma(x) {
  const g = [
    676.5203681218851, -1259.1392167224028, 771.32342877765313,
    -176.61502916214059, 12.507343278686905, -0.13857109526572012,
    9.9843695780195716e-6, 1.5056327351493116e-7,
  ];
  if (x < 0.5) {
    // 反射公式：Γ(x)Γ(1-x) = π / sin(πx)
    return Math.log(Math.PI / Math.sin(Math.PI * x)) - lgamma(1 - x);
  }
  const z = x - 1;
  let a = 0.99999999999980993;
  const t = z + 7.5;
  for (let i = 0; i < g.length; i++) a += g[i] / (z + i + 1);
  return 0.5 * Math.log(2 * Math.PI) + (z + 0.5) * Math.log(t) - t + Math.log(a);
}

/** 正則化不完全 beta 函數 I_x(a, b)。 */
export function regIncompleteBeta(x, a, b) {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const lnBeta = lgamma(a + b) - lgamma(a) - lgamma(b);
  const front = Math.exp(lnBeta + a * Math.log(x) + b * Math.log(1 - x));
  if (x < (a + 1) / (a + b + 2)) return (front * betacf(a, b, x)) / a;
  return 1 - (front * betacf(b, a, 1 - x)) / b;
}

/** Student-t 分布的單尾存活函數 P(T > t)。df 可為小數（Welch）。 */
export function studentTSf(t, df) {
  if (df <= 0) return 1;
  if (t === 0) return 0.5;
  const x = df / (df + t * t);
  // I_x(df/2, 1/2) 是雙尾機率；單尾依 t 正負對半分配
  const ib = regIncompleteBeta(x, df / 2, 0.5);
  return t > 0 ? 0.5 * ib : 1 - 0.5 * ib;
}

/** 標準常態 CDF（用 erf 的 Abramowitz-Stegun 近似）。 */
function normalCdf(x) {
  // erf 近似，最大絕對誤差 ~1.5e-7
  const sign = x < 0 ? -1 : 1;
  const z = Math.abs(x) / Math.SQRT2;
  const t = 1 / (1 + 0.3275911 * z);
  const erf =
    1 -
    ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t +
      0.254829592) *
      t *
      Math.exp(-z * z);
  return 0.5 * (1 + sign * erf);
}

/** 由檢定力反推 z（標準常態分位數），二分法。 */
function zFromPower(power) {
  let lo = -6, hi = 6;
  for (let i = 0; i < 80; i++) {
    const mid = (lo + hi) / 2;
    if (normalCdf(mid) < power) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

/**
 * mulberry32：32 位元種子的 PRNG。
 * 用固定種子而非 Math.random()，是為了讓同一份回測資料在每次重繪、
 * 每個使用者身上都得到同一個 p 值——會跳動的統計數字比沒有統計更糟。
 */
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * 檢定「每筆交易的平均損益是否顯著大於 0」。
 *
 * @param {number[]} pnls 每筆交易的報酬（% 或絕對金額皆可，單位一致即可）
 * @param {{nBootstrap?: number, alpha?: number, seed?: number}} [options]
 * @returns {{n: number, mean: number, std: number, tStat: number,
 *            pValueT: number, pValueBootstrap: number,
 *            ciLow: number, ciHigh: number, isSignificant: boolean}}
 */
export function testExpectancyPositive(pnls, { nBootstrap = 5000, alpha = 0.05, seed = 1234 } = {}) {
  if (!(alpha > 0 && alpha < 1)) throw new Error(`alpha 必須介於 0 與 1 之間，收到 ${alpha}`);
  if (!(nBootstrap >= 1)) throw new Error(`nBootstrap 必須 >= 1，收到 ${nBootstrap}`);

  const list = Array.isArray(pnls) ? pnls.filter(v => Number.isFinite(v)) : [];
  const n = list.length;
  if (n === 0) {
    return { n: 0, mean: 0, std: 0, tStat: 0, pValueT: 1, pValueBootstrap: 1, ciLow: 0, ciHigh: 0, isSignificant: false };
  }
  const mean = list.reduce((s, v) => s + v, 0) / n;
  if (n < 2) {
    // 單筆樣本無法做任何統計推論，一律視為不顯著
    return { n, mean, std: 0, tStat: 0, pValueT: 1, pValueBootstrap: 1, ciLow: mean, ciHigh: mean, isSignificant: false };
  }

  const variance = list.reduce((s, v) => s + (v - mean) ** 2, 0) / (n - 1);
  const std = Math.sqrt(variance);

  // ── t 檢定 ──
  const se = std > 0 ? std / Math.sqrt(n) : 0;
  let tStat, pT;
  if (se > 0) {
    tStat = mean / se;
    pT = studentTSf(tStat, n - 1);
  } else {
    // 標準差為 0：每筆損益都相同。全正則確定獲利，全負則確定虧損
    tStat = mean > 0 ? Infinity : mean < 0 ? -Infinity : 0;
    pT = mean > 0 ? 0 : 1;
  }

  // ── Bootstrap（shift method）──
  // p 值必須在「虛無假設成立的世界」裡重抽：把樣本平移成均值 0，
  // 再問「純靠抽樣波動，平均值至少跟觀察值一樣高的機率」。
  const rand = mulberry32(seed);
  const shifted = list.map(v => v - mean);
  const bootMeans = new Array(nBootstrap);
  let nGeObs = 0;
  for (let b = 0; b < nBootstrap; b++) {
    let sum = 0;
    for (let i = 0; i < n; i++) sum += shifted[(rand() * n) | 0];
    const bm0 = sum / n;              // H0 世界的平均
    if (bm0 >= mean) nGeObs++;
    bootMeans[b] = bm0 + mean;        // 供信賴區間用
  }
  bootMeans.sort((x, y) => x - y);
  // (n+1)/(B+1) 修正：蒙地卡羅 p 值不該印出「恰好 0」的假精準
  const pBoot = (nGeObs + 1) / (nBootstrap + 1);

  const loIdx = Math.trunc((alpha / 2) * nBootstrap);
  const hiIdx = Math.min(Math.trunc((1 - alpha / 2) * nBootstrap), nBootstrap - 1);

  return {
    n,
    mean,
    std,
    tStat,
    pValueT: pT,
    pValueBootstrap: pBoot,
    ciLow: bootMeans[loIdx],
    ciHigh: bootMeans[hiIdx],
    // 兩種檢定都過關才算顯著（雙重保險，偏保守）
    isSignificant: pT < alpha && pBoot < alpha && mean > 0,
  };
}

/**
 * 用實際損益樣本的變異估「要多少筆交易才足以驗證這不是運氣」。
 *   n ≈ ((z_alpha + z_power) × std / mean)²
 *
 * @returns {number|null} 所需樣本數；平均損益 <= 0（負期望）時回傳 null，
 *          因為負期望再多樣本也驗證不出「優勢」。
 */
export function requiredSampleSize(pnls, { alpha = 0.05, power = 0.8 } = {}) {
  const list = Array.isArray(pnls) ? pnls.filter(v => Number.isFinite(v)) : [];
  const n = list.length;
  if (n < 2) return null;
  const mean = list.reduce((s, v) => s + v, 0) / n;
  if (mean <= 0) return null;
  const variance = list.reduce((s, v) => s + (v - mean) ** 2, 0) / (n - 1);
  const std = Math.sqrt(variance);
  if (std === 0) return 30;
  const zAlpha = Math.abs(alpha - 0.05) <= 1e-12 ? Z_ALPHA_ONE_SIDED : zFromPower(1 - alpha);
  const zPower = Math.abs(power - 0.8) <= 1e-12 ? Z_POWER_80 : zFromPower(power);
  const need = (((zAlpha + zPower) * std) / mean) ** 2;
  return Math.max(30, Math.ceil(need));
}

/**
 * Welch 兩樣本 t 檢定（不假設等變異），雙尾檢定兩組平均是否不同。
 * 用於「樣本內 vs 樣本外」這種**事先指定**的單一比較。
 * 刻意不提供「掃描多個切點找最像衰退的那個」——那是資料探勘。
 *
 * @returns {null|{n1:number,n2:number,mean1:number,mean2:number,diff:number,
 *                 tStat:number,df:number,pValue:number,isSignificant:boolean}}
 *          任一組樣本 < 2 時回傳 null（無法檢定）。
 */
export function welchMeanTest(a, b, { alpha = 0.05 } = {}) {
  const A = (a || []).filter(v => Number.isFinite(v));
  const B = (b || []).filter(v => Number.isFinite(v));
  const n1 = A.length, n2 = B.length;
  if (n1 < 2 || n2 < 2) return null;
  const m1 = A.reduce((s, v) => s + v, 0) / n1;
  const m2 = B.reduce((s, v) => s + v, 0) / n2;
  const v1 = A.reduce((s, v) => s + (v - m1) ** 2, 0) / (n1 - 1);
  const v2 = B.reduce((s, v) => s + (v - m2) ** 2, 0) / (n2 - 1);
  const se2 = v1 / n1 + v2 / n2;
  const diff = m1 - m2;
  if (se2 <= 0) {
    // 兩組內部都零變異：平均相同→不顯著；不同→視為確定不同
    return {
      n1, n2, mean1: m1, mean2: m2, diff,
      tStat: diff === 0 ? 0 : Math.sign(diff) * Infinity,
      df: n1 + n2 - 2,
      pValue: diff === 0 ? 1 : 0,
      isSignificant: diff !== 0,
    };
  }
  const se = Math.sqrt(se2);
  const t = diff / se;
  // Welch–Satterthwaite 自由度
  const df = se2 ** 2 / ((v1 / n1) ** 2 / (n1 - 1) + (v2 / n2) ** 2 / (n2 - 1));
  const p = Math.min(1, Math.max(0, 2 * studentTSf(Math.abs(t), df)));
  return { n1, n2, mean1: m1, mean2: m2, diff, tStat: t, df, pValue: p, isSignificant: p < alpha };
}
