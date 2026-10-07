// CDP 當沖策略回測：對已載入的日 K 資料做規則模擬，不需要額外 API。
// 規則（與系統當沖偵測的 CDP 邏輯一致）：
//   用前一日高低收算 CDP 價位，當日開盤在 NL 之上、盤中拉回觸及 NL 視為在 NL 進場做多，
//   盤中觸及 NH 在 NH 出場，否則收盤出場。
// 純歷史模擬：未計手續費、證交稅與滑價，結果僅供參考，不代表未來績效。
//
// 除了勝率與平均報酬，這裡也回傳統計裁決：單看「勝率 62%」會嚴重高估策略，
// 因為 60 個交易日通常只觸發十幾次，那跟擲硬幣沒兩樣。裁決等級與門檻沿用
// 反詐投資王（Anti-Gambling Trader, MIT）的 judge/validate 設計：
// https://github.com/mars-tw/anti-gambling-trader-tw
import { testExpectancyPositive, requiredSampleSize, welchMeanTest } from './significance.js';

// 樣本數低於此值一律先判「樣本不足」，不論帳面好壞（對齊原專案 min_trades）
const MIN_TRADES = 30;
// 樣本內／樣本外切分比例與樣本外最小筆數
const SPLIT_RATIO = 0.7;
const MIN_SEGMENT = 5;
// 樣本外期望值衰減超過此比例，就算樣本內顯著也只能算脆弱
const MAX_DEGRADATION = 0.5;

export const VERDICT = {
  GAMBLING: 'gambling',
  INSUFFICIENT: 'insufficient',
  LUCK_SUSPECTED: 'luck_suspected',
  FRAGILE_EDGE: 'fragile_edge',
  STATISTICAL_EDGE: 'statistical_edge',
};

export const VERDICT_LABEL = {
  [VERDICT.GAMBLING]: '賭博',
  [VERDICT.INSUFFICIENT]: '樣本不足',
  [VERDICT.LUCK_SUSPECTED]: '疑似運氣',
  [VERDICT.FRAGILE_EDGE]: '脆弱優勢',
  [VERDICT.STATISTICAL_EDGE]: '具統計優勢',
};

/** 把報酬序列切成樣本內／樣本外，比較期望值是否撐得住。 */
function holdoutSplit(rets) {
  const n = rets.length;
  const cut = Math.max(MIN_SEGMENT, Math.trunc(n * SPLIT_RATIO));
  if (n - cut < MIN_SEGMENT || cut < MIN_SEGMENT) return null;

  const inSample = rets.slice(0, cut);
  const outSample = rets.slice(cut);
  const inMean = inSample.reduce((s, v) => s + v, 0) / inSample.length;
  const outMean = outSample.reduce((s, v) => s + v, 0) / outSample.length;
  // 正值代表樣本外變差；樣本內期望為 0 時衰減無意義，一律視為全額衰減
  const degradation = inMean !== 0 ? (inMean - outMean) / Math.abs(inMean) : 1;

  return {
    inTrades: inSample.length,
    outTrades: outSample.length,
    inMean: Math.round(inMean * 100) / 100,
    outMean: Math.round(outMean * 100) / 100,
    degradation: Math.round(degradation * 1000) / 1000,
    // 事先指定的單一比較（非掃描切點找最像衰退的那個，那是資料探勘）
    welch: welchMeanTest(inSample, outSample),
  };
}

/** p 值的顯示字串，連運算子一起給（避免寫出 "p=<0.001"）。
 *  極小的 p 不印成 "0.000"——那是假精準。 */
function pLabel(p) {
  return p < 0.001 ? 'p<0.001' : `p=${p.toFixed(3)}`;
}

/** 衰減比例的中文措辭（負值代表樣本外反而更好）。 */
function degradationWord(degradation) {
  return degradation >= 0
    ? `衰減 ${Math.round(degradation * 100)}%`
    : `不減反增 ${Math.round(-degradation * 100)}%`;
}

/** 依樣本量、期望值、顯著性與樣本外衰減給出裁決。 */
function judgeLevel(rets, sig, holdout, needSamples) {
  const n = rets.length;

  // A. 樣本不足 → 先承認「還不知道」。這必須排在負期望之前：
  //    小樣本的負期望同樣可能只是運氣差，直接判「賭博」過度武斷。
  if (n < MIN_TRADES) {
    return {
      level: VERDICT.INSUFFICIENT,
      headline: sig.mean < 0
        ? `樣本不足（僅 ${n} 筆）：目前帳面為負（每筆 ${sig.mean.toFixed(2)}%），但樣本太少，還無法斷定是方法不行還是運氣差。`
        : `樣本不足（僅 ${n} 筆）：帳面每筆 +${sig.mean.toFixed(2)}%，但這個樣本量還分不出優勢與運氣。`,
      detail: needSamples
        ? `以目前的報酬離散度，大約需要 ${needSamples} 筆才有 80% 的機會驗證出優勢。`
        : '負期望的樣本無法估算所需樣本量——再多筆也驗證不出「優勢」。',
    };
  }

  // B. 樣本足夠的負期望 → 方法不變，長期統計預期就是虧損。
  if (sig.mean <= 0) {
    return {
      level: VERDICT.GAMBLING,
      headline: `樣本期望值為負（${n} 筆，每筆 ${sig.mean.toFixed(2)}%）：規則不變的話，長期的統計預期就是虧損。`,
      detail: '這不是「還沒遇到好行情」，而是這組規則在這段歷史上本身就不賺錢。',
    };
  }

  // C. 帳面為正但過不了顯著性 → 無法排除運氣。
  if (!sig.isSignificant) {
    return {
      level: VERDICT.LUCK_SUSPECTED,
      headline: `帳面每筆 +${sig.mean.toFixed(2)}%，但統計上無法排除運氣（${pLabel(sig.pValueT)}）。`,
      detail: `95% 信賴區間 [${sig.ciLow.toFixed(2)}%, ${sig.ciHigh.toFixed(2)}%] 涵蓋 0，意思是「真實期望其實是 0」這件事跟目前的資料並不矛盾。`,
    };
  }

  // D. 顯著但樣本外站不住 → 脆弱。
  if (!holdout || holdout.degradation >= MAX_DEGRADATION || holdout.outMean <= 0) {
    return {
      level: VERDICT.FRAGILE_EDGE,
      headline: `樣本內顯著（${pLabel(sig.pValueT)}），但${holdout ? '樣本外撐不住' : '樣本不足以切出樣本外驗證'}。`,
      detail: holdout
        ? `前 ${holdout.inTrades} 筆每筆 ${holdout.inMean >= 0 ? '+' : ''}${holdout.inMean}%，後 ${holdout.outTrades} 筆變成 ${holdout.outMean >= 0 ? '+' : ''}${holdout.outMean}%（${degradationWord(holdout.degradation)}）。` +
          (holdout.welch
            ? holdout.welch.isSignificant
              ? `兩段的落差本身也達統計顯著（${pLabel(holdout.welch.pValue)}），不像只是波動。`
              : `不過兩段的落差尚未達統計顯著（${pLabel(holdout.welch.pValue)}），樣本外變差也可能只是運氣。`
            : '')
        : '沒有獨立的驗證區間，顯著性可能只是同一段資料被重複使用的結果。',
    };
  }

  // E. 顯著且樣本外維持正值。
  return {
    level: VERDICT.STATISTICAL_EDGE,
    headline: `通過顯著性檢定（${pLabel(sig.pValueT)}）且樣本外維持正期望。`,
    detail: `前 ${holdout.inTrades} 筆每筆 +${holdout.inMean}%，後 ${holdout.outTrades} 筆 +${holdout.outMean}%（${degradationWord(holdout.degradation)}）。仍非未來獲利保證，且此模擬未計手續費與稅費。`,
  };
}

/**
 * 對一串「每筆報酬」做完整統計裁決。與 CDP 的進出場規則無關，
 * 任何策略只要能產出每筆報酬就能共用這支。
 *
 * @param {number[]} rets 每筆報酬（%）
 * @returns {{rets: number[], needSamples: number|null, holdout: object|null,
 *            significance: object, verdict: {level: string, headline: string, detail: string}}}
 */
export function judgeReturns(rets) {
  // 固定種子：同一份資料在每次重繪、每個使用者身上都要得到同一個 p 值
  const significance = testExpectancyPositive(rets, { seed: 1234 });
  const needSamples = requiredSampleSize(rets);
  const holdout = holdoutSplit(rets);

  return {
    rets,
    needSamples,
    holdout,
    significance: {
      n: significance.n,
      mean: Math.round(significance.mean * 1000) / 1000,
      pValueT: significance.pValueT,
      pValueBootstrap: significance.pValueBootstrap,
      ciLow: Math.round(significance.ciLow * 100) / 100,
      ciHigh: Math.round(significance.ciHigh * 100) / 100,
      isSignificant: significance.isSignificant,
    },
    verdict: judgeLevel(rets, significance, holdout, needSamples),
  };
}

export function backtestCdpDayTrade(bars, days = 60) {
  if (!bars || bars.length < 2) return null;
  const win = bars.slice(-(days + 1));
  const trades = [];
  for (let i = 1; i < win.length; i++) {
    const p = win[i - 1];
    const d = win[i];
    if (!p.high || !p.low || !p.close || !d.low || !d.open) continue;
    const cdp = (p.high + p.low + 2 * p.close) / 4;
    const nh = 2 * cdp - p.low;
    const nl = 2 * cdp - p.high;
    if (d.open > nl && d.low <= nl) {
      const exit = d.high >= nh ? nh : d.close;
      trades.push({ date: d.date, ret: ((exit - nl) / nl) * 100 });
    }
  }
  if (trades.length === 0) return null;

  const rets = trades.map(t => t.ret);
  const wins = trades.filter(t => t.ret > 0).length;
  const avg = rets.reduce((s, v) => s + v, 0) / rets.length;
  const cum = rets.reduce((s, v) => s * (1 + v / 100), 1);

  return {
    days: Math.min(days, win.length - 1),
    trades: trades.length,
    winRate: Math.round((wins / trades.length) * 1000) / 10,
    avgReturn: Math.round(avg * 100) / 100,
    cumReturn: Math.round((cum - 1) * 10000) / 100,
    worst: Math.round(Math.min(...rets) * 100) / 100,
    // ── 統計裁決 ──
    ...judgeReturns(rets),
  };
}
