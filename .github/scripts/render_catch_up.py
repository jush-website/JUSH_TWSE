"""請 Render 補同步過期的策略清單，並在它跑完前持續輪詢（順便讓它不休眠）。

只在 repo 還沒設定 FIREBASE_SERVICE_ACCOUNT 時使用：Render 上有自己的 Firebase
憑證，可以代為運算並寫入。端點本身只在資料過期時才動作（見 web_app.py 的
admin_catch_up_sync），所以這支不需要任何密鑰。

只用標準函式庫，不必先 pip install。
"""
import json
import os
import sys
import time
import urllib.error
import urllib.request

BASE = os.environ.get("RENDER_API_URL", "").rstrip("/") or "https://jush-twse.onrender.com"
POLL_SECONDS = 60
MAX_WAIT_SECONDS = 50 * 60


def call(method: str, path: str, timeout: int = 150):
    """Render 免費方案冷啟動要 30-90 秒，第一發常逾時，重試幾次。"""
    last = None
    for attempt in range(4):
        try:
            req = urllib.request.Request(BASE + path, method=method, data=b"" if method == "POST" else None)
            with urllib.request.urlopen(req, timeout=timeout) as res:
                return json.loads(res.read().decode("utf-8"))
        except urllib.error.HTTPError as e:
            if e.code == 404:
                # 這支端點是新加的；Render 還沒部署到這一版時會 404
                raise SystemExit(f"::error::{path} 回 404：Render 可能還沒部署到含此端點的版本")
            last = f"HTTP {e.code}"
        except Exception as e:  # 逾時、連線被重置（冷啟動中）
            last = str(e)
        print(f"  第 {attempt + 1} 次呼叫 {path} 失敗（{last}），稍後重試…")
        time.sleep(20 * (attempt + 1))
    raise SystemExit(f"::error::呼叫 Render {path} 失敗：{last}")


def main() -> int:
    print(f"請 {BASE} 檢查並補同步過期的清單…")
    r = call("POST", "/api/admin/catch-up-sync")
    status = r.get("status")
    if status == "fresh":
        print(f"所有清單都已是最新（基準日 {r.get('expected_base_date')}），不需要補。")
        return 0
    if status == "cooldown":
        print(f"::notice::Render 剛補同步過，冷卻中（約 {r.get('retry_after_seconds', 0) // 60} 分鐘後才能再觸發）。")
        return 0
    if status == "no_firestore":
        print("::error::Render 也沒有連上 Firestore（缺 FIREBASE_SERVICE_ACCOUNT 環境變數），兩條路都寫不進去。")
        return 1
    if status not in ("started", "already_running"):
        print(f"::error::Render 回應無法辨識：{r}")
        return 1
    if status == "started":
        print(f"已開始補同步，過期的清單：{', '.join(r.get('stale', []))}")
    else:
        print("Render 已經在同步中，等它跑完。")

    waited = 0
    while waited < MAX_WAIT_SECONDS:
        time.sleep(POLL_SECONDS)
        waited += POLL_SECONDS
        s = call("GET", "/api/admin/sync-status")
        if not s.get("running"):
            result = s.get("result") or {}
            ok = [k for k, v in result.items() if v == "ok"]
            print(f"\n補同步完成：成功 {len(ok)}/{len(result)}")
            for name, detail in result.items():
                if detail != "ok":
                    print(f"::warning::{name}：{detail}")
            for dataset, info in (s.get("official_fallbacks") or {}).items():
                print(f"官方資料退路 {dataset}（{info.get('at', '')}）：{'；'.join(info.get('result', []))}")
            return 0 if ok else 1
        print(f"  {waited // 60} 分鐘：同步中，最近寫入 {s.get('last_write_doc') or '（尚無）'}")
    print("::error::等了 50 分鐘還沒跑完，Render 可能中途休眠或重啟。")
    return 1


if __name__ == "__main__":
    sys.exit(main())
