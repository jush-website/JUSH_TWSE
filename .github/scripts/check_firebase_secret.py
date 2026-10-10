"""驗證 FIREBASE_SERVICE_ACCOUNT secret 的格式，絕不印出內容。

由 sync-market-data workflow 呼叫。只回答「這份憑證看起來能用嗎」，
避免跑完整個同步才發現憑證貼錯、或貼成了帶引號的字串。

輸出 has_secret=true/false（GITHUB_OUTPUT）：沒設定時 workflow 改走 Render 補同步；
設了但格式錯誤則直接失敗——那是要人去修的錯，不該默默改走退路。
"""
import json
import os
import sys


def main() -> int:
    raw = os.environ.get("FIREBASE_SERVICE_ACCOUNT", "")
    if not raw.strip():
        # 沒設定不算失敗：workflow 會改請 Render 補同步（Render 上有自己的憑證），
        # 資料照樣會更新。這裡只留下醒目的提醒，設好之後就改由 Actions 直接運算。
        print("::warning::尚未設定 secret FIREBASE_SERVICE_ACCOUNT，本次改由 Render 補同步。"
              "到 Settings → Secrets and variables → Actions → Secrets 分頁 → "
              "New repository secret 新增後，就不必再依賴 Render。")
        _set_output("has_secret", "false")
        return 0
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
    _set_output("has_secret", "true")
    return 0


def _set_output(name: str, value: str) -> None:
    path = os.environ.get("GITHUB_OUTPUT")
    if path:
        with open(path, "a", encoding="utf-8") as f:
            f.write(f"{name}={value}\n")


if __name__ == "__main__":
    sys.exit(main())
