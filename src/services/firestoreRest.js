// 前端對 Firestore 只有「讀一份文件」這一種用法，為此載入官方 SDK 不划算：
// firebase/app + firebase/firestore 壓縮後仍有 ~112 kB，而且 SDK 的 getDoc 走
// WebChannel 串流，要先握手好幾個來回才拿得到第一筆資料。Firestore 的 REST
// API 一個 GET 就回來，安全規則照樣生效（同一把 web API key、同一套 rules），
// 所以改用原生 fetch 直接讀，省下整包 SDK 和握手時間。
const PROJECT_ID = 'twse-3120a';
// web API key 本來就會出現在前端程式碼裡，它只用來辨識專案，存取權限由安全規則控管
const API_KEY = 'AIzaSyAlTTKUZdyzH2sw8qi8O2HFkQo_3eJb5Mk';
const BASE = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents`;

/**
 * 把 REST 回傳的型別化欄位（{stringValue: ...}、{mapValue: {fields}} …）
 * 轉回一般 JS 值，結果與 SDK 的 snapshot.data() 相同；唯一差別是時間戳記
 * 轉成 Date（SDK 給的是 Timestamp，呼叫端兩種都接受）。
 */
export function decodeValue(v) {
  if (v == null) return null;
  if ('nullValue' in v) return null;
  if ('booleanValue' in v) return v.booleanValue;
  if ('stringValue' in v) return v.stringValue;
  // integerValue 以字串傳輸（int64 超出 JS 安全整數範圍時才會失真，這裡的資料用不到那麼大）
  if ('integerValue' in v) return Number(v.integerValue);
  // NaN / Infinity 會以字串 "NaN" / "Infinity" 出現，Number() 剛好轉得回來
  if ('doubleValue' in v) return Number(v.doubleValue);
  if ('timestampValue' in v) return new Date(v.timestampValue);
  if ('mapValue' in v) return decodeFields(v.mapValue.fields);
  if ('arrayValue' in v) return (v.arrayValue.values || []).map(decodeValue);
  if ('referenceValue' in v) return v.referenceValue;
  if ('bytesValue' in v) return v.bytesValue;
  if ('geoPointValue' in v) return { latitude: v.geoPointValue.latitude ?? 0, longitude: v.geoPointValue.longitude ?? 0 };
  return null;
}

export function decodeFields(fields = {}) {
  const out = {};
  for (const [k, v] of Object.entries(fields)) out[k] = decodeValue(v);
  return out;
}

/**
 * 讀一份文件。不存在回傳 null；其他錯誤丟出，交給呼叫端決定要不要退回 API。
 *
 * @param {string} collection
 * @param {string} docId
 * @param {{fields?: string[], signal?: AbortSignal}} [opts]
 *   fields：只取這幾個欄位（Firestore 的 field mask）。像導覽列只需要
 *   updated_at，就不必每分鐘下載整份 50 kB 的策略清單。
 */
export async function getDocument(collection, docId, { fields, signal } = {}) {
  const params = new URLSearchParams({ key: API_KEY });
  for (const f of fields || []) params.append('mask.fieldPaths', f);
  const url = `${BASE}/${encodeURIComponent(collection)}/${encodeURIComponent(docId)}?${params}`;
  const res = await fetch(url, { signal });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Firestore ${collection}/${docId} 讀取失敗：HTTP ${res.status}`);
  const body = await res.json();
  return decodeFields(body.fields);
}

// 同一份文件在短時間內常被重複要：首頁和資金流向頁都讀 news / capital_flow，
// 切換分頁再切回來也會重抓。預算資料一天才更新幾次，30 秒內共用同一個結果
// 不會讓人看到舊資料，卻能省掉重複的往返。失敗的請求不快取，下一次會重打。
const CACHE_TTL_MS = 30 * 1000;
const cache = new Map();

export function getDocumentCached(collection, docId, opts = {}) {
  const key = `${collection}/${docId}${opts.fields ? `?${opts.fields.join(',')}` : ''}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.promise;
  const promise = getDocument(collection, docId, opts).catch((err) => {
    cache.delete(key);
    throw err;
  });
  cache.set(key, { promise, at: Date.now() });
  return promise;
}
