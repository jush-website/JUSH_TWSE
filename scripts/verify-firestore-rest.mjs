/**
 * 驗證 src/services/firestoreRest.js 把 Firestore REST 的型別化欄位還原成
 * 與 SDK snapshot.data() 相同的值。
 *
 * 移除 firebase SDK 前，已對正式環境全部 15 份文件（含 340 kB 的 hot_stocks、
 * 不存在的文件、raw_data_cache）逐一比對 SDK 與 REST 的結果，完全一致。
 * SDK 移除後無法再跑那份比對，這裡用涵蓋每一種型別的固定樣本守住解碼邏輯。
 */
import { decodeFields } from '../src/services/firestoreRest.js';

const fields = {
  s: { stringValue: '台積電' },
  i: { integerValue: '2330' },
  neg: { integerValue: '-12' },
  d: { doubleValue: 1.25 },
  nan: { doubleValue: 'NaN' },
  b: { booleanValue: false },
  n: { nullValue: null },
  t: { timestampValue: '2026-10-08T09:54:50.368Z' },
  emptyArr: { arrayValue: {} },
  emptyMap: { mapValue: {} },
  arr: { arrayValue: { values: [{ integerValue: '1' }, { mapValue: { fields: { k: { stringValue: 'v' } } } }] } },
  nested: { mapValue: { fields: { inner: { arrayValue: { values: [{ doubleValue: 0.5 }] } } } } },
  geo: { geoPointValue: { latitude: 25.03 } },
};
const got = decodeFields(fields);
const expect = {
  s: '台積電', i: 2330, neg: -12, d: 1.25, b: false, n: null,
  emptyArr: [], emptyMap: {}, arr: [1, { k: 'v' }], nested: { inner: [0.5] },
  geo: { latitude: 25.03, longitude: 0 },
};

let fail = 0;
const check = (label, ok) => { if (!ok) fail++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}`); };
for (const [k, v] of Object.entries(expect)) check(k.padEnd(9) + JSON.stringify(got[k]), JSON.stringify(got[k]) === JSON.stringify(v));
check('nan      NaN', Number.isNaN(got.nan));
check('t        Date', got.t instanceof Date && got.t.toISOString() === '2026-10-08T09:54:50.368Z');
check('空文件    {}', JSON.stringify(decodeFields(undefined)) === '{}');
console.log(fail ? `\n${fail} 項失敗` : '\n全部通過');
process.exit(fail ? 1 : 0);
