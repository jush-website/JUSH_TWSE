/**
 * 判斷 Firestore 上的策略資料是不是已經過期到不該再顯示。
 *
 * 背景：策略頁的資料是由後端排程寫進 Firestore 的。同步一旦中斷（Render 免費
 * 方案休眠、憑證失效等），Firestore 裡會留著上一次成功寫入的舊資料——非空、
 * 但可能是好幾天前的。前端原本只在「資料為空」時才改用即時運算，因此這種
 * 「舊但存在」的資料會被一直顯示下去。
 *
 * 以「距今隔了幾個交易日」判斷，週末與休市日不算。原本只扣週末，結果連假
 * 隔天（例如國慶補假後的週一）資料明明是最新的，卻被判成過期、整站改打
 * 慢吞吞的即時運算。休市日清單與後端共用同一份（見 twHolidays.js），並由
 * 驗證腳本確保兩邊一致。誤判成過期的代價只是多打一次即時運算；誤判成新鮮
 * 才會讓舊資料一直顯示，所以清單缺漏時偏向前者。
 */
import { TW_HOLIDAYS } from './twHolidays.js';

const ymd = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** 兩個日期之間隔了幾個交易日（不含週末與台股休市日）。 */
function weekdaysBetween(from, to) {
  let count = 0;
  const cursor = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  const end = new Date(to.getFullYear(), to.getMonth(), to.getDate());
  while (cursor < end) {
    cursor.setDate(cursor.getDate() + 1);
    const day = cursor.getDay();
    if (day !== 0 && day !== 6 && !TW_HOLIDAYS.has(ymd(cursor))) count++;
  }
  return count;
}

/**
 * @param {string|null} baseDate 資料基準日，格式 YYYY-MM-DD
 * @param {number} maxWeekdays 容許落後幾個工作日（預設 3，足以吸收一般連假）
 * @param {Date} [now] 測試用；預設當下時間
 * @returns {boolean} true 代表資料太舊、該改用即時運算
 */
export function isStaleBaseDate(baseDate, maxWeekdays = 3, now = new Date()) {
  // 沒有基準日就無從判斷；當作新鮮，交由既有的「空資料」邏輯處理，
  // 免得每次載入都白打一次昂貴的即時運算。
  if (!baseDate) return false;

  const parts = /^(\d{4})-(\d{2})-(\d{2})$/.exec(baseDate.trim());
  if (!parts) return false;

  const base = new Date(Number(parts[1]), Number(parts[2]) - 1, Number(parts[3]));
  if (Number.isNaN(base.getTime())) return false;

  // 基準日在未來（伺服器時區或使用者時鐘偏差）不算過期
  if (base > now) return false;

  return weekdaysBetween(base, now) > maxWeekdays;
}
