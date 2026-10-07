"""驗證 FIREBASE_SERVICE_ACCOUNT secret 的格式，絕不印出內容。

由 sync-market-data workflow 呼叫。只回答「這份憑證看起來能用嗎」，
避免跑完整個同步才發現憑證貼錯、或貼成了帶引號的字串。
"""
import json
import os
import sys


def main() -> int:
    raw = os.environ.get("FIREBASE_SERVICE_ACCOUNT", "")
    if not raw.strip():
        print("::error::缺少 secret FIREBASE_SERVICE_ACCOUNT，資料算了也寫不進去")
        return 1
    try:
        data = json.loads(raw)
    except json.JSONDecodeError as e:
        print(f"::error::FIREBASE_SERVICE_ACCOUNT 不是合法 JSON（{e}）。"
              "常見原因：貼上時多了外層引號，或換行被轉義破壞。")
        return 1
    if not isinstance(data, dict):
        print("::error::FIREBASE_SERVICE_ACCOUNT 應該是一個 JSON 物件")
        return 1
    missing = [k for k in ("project_id", "private_key", "client_email") if not data.get(k)]
    if missing:
        print(f"::error::FIREBASE_SERVICE_ACCOUNT 缺少欄位：{', '.join(missing)}")
        return 1
    # project_id 不是機密，印出來方便確認有沒有貼到別的專案
    print(f"憑證格式正常（project: {data['project_id']}）")
    return 0


if __name__ == "__main__":
    sys.exit(main())
