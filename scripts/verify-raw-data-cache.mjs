/**
 * 驗證 src/utils/rawDataCache.js —— 個股原始資料快取的新鮮度判斷。
 *
 * TTL 必須與後端 web_app.get_raw_data() 的 cache_ttl 一致（盤中 30 分、
 * 盤後 4 小時），否則前端會拿過期資料當新鮮的用。盤中判斷刻意用台北時區，
 * 用本機時區的話海外使用者會得到完全錯誤的 TTL——所以特別測不同時區。
 */
import { isMarketHours, isCacheFresh, looksLikeStockId, quoteToIntraday } from '../src/utils/rawDataCache.js';

let fail = 0;
const t = (n, ok, extra = '') => { if (!ok) fail++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${n.padEnd(44)} ${extra}`); };

// 用 UTC 建構，再讓程式自己換算成台北時間（+8）
const utc = (y, mo, d, h, mi) => new Date(Date.UTC(y, mo - 1, d, h, mi));

console.log('── 盤中判斷（台北時間 09:00–13:30，週一至週五）──');
for (const [label, when, want] of [
  ['週三 09:00 台北（UTC 01:00）',  utc(2026, 10, 7, 1, 0),  true],
  ['週三 08:59 台北',               utc(2026, 10, 7, 0, 59), false],
  ['週三 13:29 台北',               utc(2026, 10, 7, 5, 29), true],
  ['週三 13:30 台北（收盤）',        utc(2026, 10, 7, 5, 30), false],
  ['週三 21:00 台北',               utc(2026, 10, 7, 13, 0), false],
  ['週六 11:00 台北',               utc(2026, 10, 10, 3, 0), false],
  ['週日 11:00 台北',               utc(2026, 10, 11, 3, 0), false],
  // 台北週一 09:30 = UTC 週一 01:30；但 UTC 週日 23:00 已是台北週一 07:00
  ['UTC 週日 23:00（台北週一 07:00）', utc(2026, 10, 11, 23, 0), false],
  ['UTC 週日 01:30（台北週一 09:30）', utc(2026, 10, 12, 1, 30), true],
]) {
  const got = isMarketHours(when);
  t(label, got === want, got ? '盤中' : '非盤中');
}

console.log('\n── TTL：盤中 30 分、盤後 4 小時 ──');
const marketNow = utc(2026, 10, 7, 3, 0);   // 台北週三 11:00，盤中
const offNow = utc(2026, 10, 7, 13, 0);     // 台北週三 21:00，盤後
const iso = (d) => d.toISOString();
for (const [label, updatedAt, now, want] of [
  ['盤中、10 分鐘前',  iso(new Date(marketNow - 10 * 60e3)), marketNow, true],
  ['盤中、29 分鐘前',  iso(new Date(marketNow - 29 * 60e3)), marketNow, true],
  ['盤中、31 分鐘前',  iso(new Date(marketNow - 31 * 60e3)), marketNow, false],
  ['盤後、3 小時前',   iso(new Date(offNow - 3 * 3600e3)),   offNow,    true],
  ['盤後、5 小時前',   iso(new Date(offNow - 5 * 3600e3)),   offNow,    false],
  ['時間戳在未來',     iso(new Date(offNow.getTime() + 60e3)), offNow,  false],
  ['沒有時間戳',       null,                                  offNow,  false],
  ['時間戳不合法',     'not-a-date',                          offNow,  false],
]) {
  const got = isCacheFresh(updatedAt, now);
  t(label, got === want, got ? '可用' : '過期');
}

console.log('\n── 代號辨識（只有代號查得動快取文件）──');
for (const [q, want] of [
  ['2330', true], ['6488', true], ['00878', true], ['2330A', true],
  ['台積電', false], ['', false], ['123', false], ['../etc', false], [null, false],
]) {
  const got = looksLikeStockId(q);
  t(`${String(q).padEnd(10)}`, got === want, got ? '視為代號' : '走後端解析');
}

console.log('\n── 報價轉 intraday ──');
{
  const q = { price: 1105, open: 1095, volume: 25000000, prev_close: 1090, high: 1110, low: 1092 };
  const r = quoteToIntraday(q);
  t('帶入 price/open/volume/yesterday_close',
    r.price === 1105 && r.open === 1095 && r.volume === 25000000 && r.yesterday_close === 1090,
    JSON.stringify(r));
  // analyzer 的 calculateCdp 對這三個欄位是選配，缺了會改用日線序列
  t('不虛構 yesterday_high/low/cdp_base_date',
    !('yesterday_high' in r) && !('yesterday_low' in r) && !('cdp_base_date' in r));
  t('沒有報價時回空物件（analyzer 會略過注入）',
    JSON.stringify(quoteToIntraday(null)) === '{}' && JSON.stringify(quoteToIntraday({ price: 0 })) === '{}');
}

console.log('\n── analyzer 的注入條件 ──');
{
  // analyzer.js:398 `if (intraday && intraday.price > 0 && intraday.volume > 0)`
  const willInject = (i) => !!(i && i.price > 0 && i.volume > 0);
  t('有價有量 → 會注入', willInject(quoteToIntraday({ price: 1105, volume: 100, open: 1100 })));
  t('有價無量（盤前）→ 不注入', !willInject(quoteToIntraday({ price: 1105, volume: 0, open: null })));
}

console.log(`\n${fail === 0 ? '✅ 快取判斷與後端 TTL 一致' : `❌ ${fail} 項失敗`}`);
process.exit(fail ? 1 : 0);
