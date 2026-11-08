/**
 * 驗證普林格檢核表（src/utils/pring.js）。
 *
 * 用構造出來的 K 線測：每個情境的正確答案由書中規則直接決定
 * （例如「波峰波谷持續墊高 = 上升趨勢」「收盤突破前高 3% 且放量 = 有效突破」），
 * 所以這裡測的是規則有沒有被正確實作，不是預測準不準。
 *
 * 用法：node scripts/verify-pring.mjs
 */
import { evaluatePring, findPivots, STANCE } from '../src/utils/pring.js';

let fail = 0;
const t = (name, ok, extra = '') => { if (!ok) fail++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}  ${extra}`); };

/** 由收盤價序列造 K 棒：高低點在收盤上下 1%，量固定（可個別覆寫）。 */
function makeBars(closes, vols = []) {
  return closes.map((c, i) => ({
    date: `D${String(i).padStart(3, '0')}`,
    open: c, high: c * 1.01, low: c * 0.99, close: c,
    volume: vols[i] ?? 1000,
  }));
}

/** 帶波浪的趨勢：每日漂移 drift，疊上週期 period、振幅 amp 的正弦波。 */
function wave(n, start, drift, amp = 0.04, period = 20) {
  return Array.from({ length: n }, (_, i) => start * (1 + drift * i) * (1 + amp * Math.sin((2 * Math.PI * i) / period)));
}

const item = (res, key) => res.items.find(it => it.key === key);

// ── 1. 資料太少 → null，不硬算 ──
t('少於 30 根回傳 null', evaluatePring(makeBars(wave(20, 100, 0.001))) === null);

// ── 2. 波段高低點偵測 ──
{
  const highs = [1, 2, 3, 4, 5, 9, 5, 4, 3, 2, 1, 2, 3];
  const lows = highs.map(h => h - 0.5);
  const p = findPivots(highs, lows, 5);
  t('單一尖峰被認成波峰', p.some(x => x.type === 'H' && x.i === 5));
  t('最後 k 根不列入（尚未確認）', !p.some(x => x.i > highs.length - 6));
}

// ── 3. 穩定上升（波峰波谷墊高、在長均線上）→ 趨勢偏多 ──
{
  const res = evaluatePring(makeBars(wave(240, 100, 0.004)));
  const tr = item(res, 'trend');
  t('上升趨勢：長均線用 200 日', tr.longWin === 200, `longWin=${tr.longWin}`);
  t('上升趨勢：主要趨勢 bull', tr.primary === 'bull', tr.primary);
  t('上升趨勢：波峰波谷墊高', tr.swing === 'up', tr.swing);
  t('上升趨勢：檢核項 1 偏多', tr.stance === STANCE.BULL);
  t('摘要包含波段高低點', /波段高低點/.test(res.summary));
}

// ── 4. 穩定下降 → 趨勢偏空 ──
{
  const res = evaluatePring(makeBars(wave(240, 300, -0.002)));
  const tr = item(res, 'trend');
  t('下降趨勢：主要趨勢 bear', tr.primary === 'bear', tr.primary);
  t('下降趨勢：波峰波谷降低', tr.swing === 'down', tr.swing);
  t('下降趨勢：檢核項 1 偏空', tr.stance === STANCE.BEAR);
}

// ── 4b. 頂部反轉：上升中出現較低波峰，再收盤跌破前波谷 ──
{
  const path = (pts, step = 10) => pts.slice(1).flatMap((p, k) =>
    Array.from({ length: step }, (_, j) => pts[k] + ((p - pts[k]) * (j + 1)) / step));
  const flat = Array.from({ length: 60 }, (_, i) => 90 + (i % 2) * 0.5);
  const closes = [...flat, ...path([90, 110, 100, 130, 115, 125, 112])];
  const tr = item(evaluatePring(makeBars(closes)), 'trend');
  t('較低波峰後跌破前波谷 → top-reversal', tr.swing === 'top-reversal', tr.swing);
  const flatOnly = findPivots(Array(30).fill(10), Array(30).fill(9), 5);
  t('完全橫盤不產生大量轉折點', flatOnly.length <= 2, `轉折點 ${flatOnly.length} 個`);
}

// ── 5. 資料不足 200 根 → 退用較短均線並註明 ──
{
  const res = evaluatePring(makeBars(wave(150, 100, 0.003)));
  const tr = item(res, 'trend');
  t('150 根改用 100 日線', tr.longWin === 100, `longWin=${tr.longWin}`);
  t('並在說明中註明資料不足', tr.lines[0].includes('資料不足 200 日'));
}

// ── 6. 3% 原則＋量能：盤整後放量大漲 4% → 有效突破；同樣漲幅但無量 → 未確認 ──
{
  const base = Array.from({ length: 100 }, (_, i) => 100 + 2 * Math.sin(i / 3));
  const closes = [...base, 107];
  const prevHigh = Math.max(...base.slice(-60).map(c => c * 1.01));
  const withVol = evaluatePring(makeBars(closes, [...base.map(() => 1000), 3000]));
  const noVol = evaluatePring(makeBars(closes, [...base.map(() => 1000), 1000]));
  t('收盤 ≥ 前高×1.03', 107 >= prevHigh * 1.03, `前高=${prevHigh.toFixed(2)}`);
  t('放量 → up-confirmed', item(withVol, 'ma').breakout === 'up-confirmed', item(withVol, 'ma').breakout);
  t('無量 → up-no-volume', item(noVol, 'ma').breakout === 'up-no-volume', item(noVol, 'ma').breakout);

  const small = evaluatePring(makeBars([...base, prevHigh * 1.01], [...base.map(() => 1000), 3000]));
  t('突破未達 3% → up-unconfirmed', item(small, 'ma').breakout === 'up-unconfirmed', item(small, 'ma').breakout);
}

// ── 7. 假突破：突破後幾天內跌回界線下 → failed-up（反向警訊）──
{
  const base = Array.from({ length: 100 }, (_, i) => 100 + 2 * Math.sin(i / 3));
  const closes = [...base, 104, 103, 99, 98];
  const res = evaluatePring(makeBars(closes));
  t('突破後跌回 → failed-up', item(res, 'ma').breakout === 'failed-up', item(res, 'ma').breakout);
}

// ── 8. 向下跌破 3% 不需要量 ──
{
  const base = Array.from({ length: 100 }, (_, i) => 100 + 2 * Math.sin(i / 3));
  const res = evaluatePring(makeBars([...base, 93]));
  t('跌破前低 3% → down-confirmed（無量也算）', item(res, 'ma').breakout === 'down-confirmed', item(res, 'ma').breakout);
}

// ── 9. 支撐阻力與停損：停損在支撐下方、盈虧比可算 ──
{
  const res = evaluatePring(makeBars(wave(200, 100, 0.0005, 0.06, 24)));
  const sr = item(res, 'sr');
  const risk = item(res, 'risk');
  const close = 100 * (1 + 0.0005 * 199) * (1 + 0.06 * Math.sin((2 * Math.PI * 199) / 24));
  if (sr.support) t('停損低於支撐區下緣', risk.stop < sr.support.lo, `stop=${risk.stop} 支撐=${sr.support.lo}`);
  else t('無支撐時停損退用波谷', risk.stop === null || risk.stop < close);
  t('停損低於現價', risk.stop === null || risk.stop < close);
  if (sr.resistance && risk.rr !== null) t('盈虧比 = (阻力-現價)/(現價-停損)', Math.abs(risk.rr - (sr.resistance.lo - close) / (close - risk.stop)) < 0.02, `rr=${risk.rr}`);
}

// ── 10. 動能只是警訊：牛市中 RSI 超買不得被當成偏空 ──
{
  const closes = wave(240, 100, 0.006, 0.01, 30);
  const res = evaluatePring(makeBars(closes));
  const mom = item(res, 'momentum');
  const rsiLine = mom.lines.find(l => l.startsWith('RSI'));
  t('牛市強勢上漲時 RSI 說明提到鈍化或未超買', !!rsiLine && (!/超買/.test(rsiLine) || /鈍化/.test(rsiLine)), rsiLine);
}

// ── 11. 輸出形狀 ──
{
  const res = evaluatePring(makeBars(wave(240, 100, 0.004)));
  t('固定 6 個檢核項', res.items.length === 6);
  t('每項都有 stance 與說明', res.items.every(it => Object.values(STANCE).includes(it.stance) && it.lines.length > 0));
  t('overall 為合法值', Object.values(STANCE).includes(res.overall));
}

console.log(fail ? `\n❌ ${fail} 項失敗` : '\n✅ 普林格檢核表全部通過');
process.exit(fail ? 1 : 0);
