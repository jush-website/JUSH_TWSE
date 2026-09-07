"""檢查 /api/admin/sync-status 的回應。

由 sync-recommendations workflow 呼叫，從 stdin 讀 JSON。
用法：
    check_sync_status.py preflight   同步前檢查後端是否具備寫入條件
    check_sync_status.py result      同步結束後彙整各項目的成敗
"""
import json
import sys


def main():
    mode = sys.argv[1] if len(sys.argv) > 1 else "preflight"
    raw = sys.stdin.read()
    try:
        data = json.loads(raw)
    except json.JSONDecodeError:
        print(f"::error::sync-status 回應不是合法 JSON：{raw[:200]}")
        return 1

    if mode == "preflight":
        # Firestore 沒接上的話，同步跑再多次也寫不進去，早點失敗比較好排查
        if not data.get("firestore_connected"):
            print("::error::後端沒有連上 Firestore，請檢查 Render 的 "
                  "FIREBASE_SERVICE_ACCOUNT 環境變數")
            return 1
        if not data.get("admin_secret_configured"):
            print("::error::後端沒有讀到 ADMIN_SYNC_SECRET 環境變數")
            return 1
        print(f"後端狀態正常，資料基準日：{data.get('expected_base_date')}")
        return 0

    if mode == "result":
        result = data.get("result") or {}
        if not result:
            print("::warning::同步已結束，但沒有回報任何項目結果")
            return 0
        failed = {k: v for k, v in result.items() if v != "ok"}
        for name, detail in failed.items():
            print(f"::warning::{name} 同步失敗：{detail}")
        if failed:
            print(f"::warning::共 {len(failed)}/{len(result)} 個項目失敗")
        else:
            print(f"全部 {len(result)} 個項目同步成功")
        return 0

    print(f"::error::未知的模式 {mode}")
    return 1


if __name__ == "__main__":
    sys.exit(main())
