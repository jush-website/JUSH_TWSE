/**
 * 把使用者輸入的「代號或名稱」解析成股票代號 —— 純前端，不需要後端。
 *
 * 後端的 resolve_stock_id() 需要 Render 醒著才能回答，而個股分析頁的其他部分
 * 已經能直接讀 Firestore 了。只為了把「台積電」翻成「2330」就叫醒一台休眠的
 * 伺服器、等 30-60 秒冷啟動，是整條路徑上最沒道理的一環。
 *
 * 對照表來自 src/assets/stock_names.json，**動態載入**：它有 357 kB，絕不能
 * 進首包。只具名匯入 name_map，佔 75% 體積的 industry 會被 tree-shaking 搖掉，
 * 實際下載約 19 kB（gzip），而且只在使用者真的用名稱搜尋時才載。
 *
 * 與後端的刻意差異：
 *   後端的部分比對是「迭代到第一個包含關鍵字的名稱就回傳」，順序取決於它從
 *   TWSE API 收到的順序——是任意的。這裡改成「最短的符合名稱優先，同長度時
 *   比代號」，結果穩定且通常更貼近使用者想找的那檔（輸入「長榮」會給長榮
 *   而不是長榮航）。
 *
 * 這份對照表是靜態快照，新上市的股票可能查不到。查不到時回傳 null，
 * 呼叫端要退回後端（後端的對照表是從 TWSE API 即時建的）。
 */

/** 看起來像台股代號嗎？（與 rawDataCache.js 的判斷一致） */
export const looksLikeStockId = (q) => /^[0-9]{4,6}[A-Z]?$/.test(String(q || '').trim());

let nameMapPromise = null;

/** 載入並快取名稱對照表；失敗不記住，下次還能重試。 */
export function loadNameMap() {
  if (!nameMapPromise) {
    nameMapPromise = import('../assets/stock_names.json')
      .then((m) => m.name_map || {})
      .catch((err) => {
        nameMapPromise = null;
        throw err;
      });
  }
  return nameMapPromise;
}

/**
 * 純粹的解析邏輯：給定對照表與查詢字串，算出代號。
 *
 * 刻意與載入分離，這樣測試可以直接餵真實的對照表驗證規則，
 * 不必依賴打包器才支援的 JSON 動態匯入。
 *
 * @param {Record<string, string>} nameMap 名稱 → 代號
 * @param {string} query 代號或名稱
 * @returns {string|null}
 */
export function resolveFromMap(nameMap, query) {
  const q = String(query ?? '').trim();
  if (!q) return null;
  // 已經是代號就直接用
  if (looksLikeStockId(q)) return q;
  if (!nameMap) return null;

  // 1. 名稱完全相同
  if (nameMap[q]) return nameMap[q];

  // 2. 部分比對：最短的符合名稱優先，同長度比代號（結果穩定可重現）
  let best = null;
  for (const name of Object.keys(nameMap)) {
    if (!name.includes(q)) continue;
    const sid = nameMap[name];
    if (
      best === null
      || name.length < best.name.length
      || (name.length === best.name.length && sid < best.sid)
    ) {
      best = { name, sid };
    }
  }
  return best ? best.sid : null;
}

/**
 * @param {string} query 代號或名稱
 * @returns {Promise<string|null>} 代號；查不到回 null（呼叫端應退回後端）
 */
export async function resolveStockId(query) {
  const q = String(query ?? '').trim();
  if (!q) return null;
  // 已經是代號就不必載對照表
  if (looksLikeStockId(q)) return q;

  let nameMap;
  try {
    nameMap = await loadNameMap();
  } catch (err) {
    // 不要靜默：對照表載不到會讓每次名稱查詢都多繞一趟後端，
    // 是該被看到的問題，不是正常路徑。
    console.warn('股號對照表載入失敗，名稱解析改由後端處理', err);
    return null;
  }
  return resolveFromMap(nameMap, q);
}
