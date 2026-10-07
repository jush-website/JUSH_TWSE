/**
 * 判斷 Firestore 上的策略資料是不是已經過期到不該再顯示。
 *
 * 背景：策略頁的資料是由後端排程寫進 Firestore 的。同步一旦中斷（Render 免費
 * 方案休眠、憑證失效等），Firestore 裡會留著上一次成功寫入的舊資料——非空、
 * 但可能是好幾天前的。前端原本只在「資料為空」時才改用即時運算，因此這種
 * 「舊但存在」的資料會被一直顯示下去。
 *
 * 這裡刻意不複製一份國定假日表（那註定會跟後端的 config.TW_HOLIDAYS_2026 走鐘），
 * 改用「距今幾個工作日」這個寬鬆但單調的指標。誤判成過期的代價只是多打一次
 * 即時運算、拿到同樣的結果；誤判成新鮮才是我們要修的問題。所以門檻刻意抓寬，
 * 並偏向「寧可判定過期」。
 */

/** 兩個日期之間隔了幾個工作日（不含週末，不扣國定假日）。 */
function weekdaysBetween(from, to) {
  let count = 0;
  const cursor = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  const end = new Date(to.getFullYear(), to.getMonth(), to.getDate());
  while (cursor < end) {
    cursor.setDate(cursor.getDate() + 1);
    const day = cursor.getDay();
    if (day !== 0 && day !== 6) count++;
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
