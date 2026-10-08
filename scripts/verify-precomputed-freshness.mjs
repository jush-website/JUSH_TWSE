/**
 * 驗證 fetchPrecomputed 的過期門檻（isStaleBaseDate, maxWeekdays = 1）在常見
 * 時點的判斷。get_published_base_date 以 14:30 為界：收盤前基準日是前一個交易日，
 * 所以「落後 1 個工作日」必須算新鮮，落後 2 個以上（排程整天沒跑）才算過期。
 */
import { isStaleBaseDate } from '../src/utils/freshness.js';

const LAG = 1;
const at = (s) => new Date(`${s}T10:00:00`);
const cases = [
  // [說明, 基準日, 現在, 預期過期?]
  ['週三上午，基準日週二（收盤前）', '2026-10-06', at('2026-10-07'), false],
  ['週三下午，基準日週三',           '2026-10-07', at('2026-10-07'), false],
  ['週一上午，基準日上週五',         '2026-10-02', at('2026-10-05'), false],
  ['週三，基準日週一（週二整天沒同步）', '2026-10-05', at('2026-10-07'), true],
  ['兩個月前的策略文件',             '2026-08-03', at('2026-10-07'), true],
  ['沒有基準日（交給空資料邏輯）',   null,         at('2026-10-07'), false],
];

let fail = 0;
for (const [label, base, now, expected] of cases) {
  const got = isStaleBaseDate(base, LAG, now);
  if (got !== expected) fail++;
  console.log(`${got === expected ? 'PASS' : 'FAIL'}  ${label.padEnd(24)} → ${got ? '過期' : '新鮮'}`);
}
console.log(fail ? `\n${fail} 項失敗` : '\n全部通過');
process.exit(fail ? 1 : 0);
