# 部署到實驗室 AGX Orin

一個 FastAPI 行程（`src/backend/web_app.py`，port 8000）同時提供 API 和編譯好的前端（`dist/`），
所以 Orin 上只要跑這一個服務。AI 解讀透過 Tailscale 打 DGX Spark 上的 Ollama。

## 1. 把程式放到 Orin：用 git，不要整包複製

在 Orin 上直接從 GitHub 拉，之後更新只要 `git pull`，不會有「哪一版才是最新」的問題：

```bash
git clone https://github.com/jush-website/JUSH_TWSE.git ~/JUSH_TWSE
cd ~/JUSH_TWSE
```

**不在 git 裡、要另外從你電腦複製過去的只有機密檔**（在你自己電腦上執行）：

```bash
scp serviceAccountKey.json <帳號>@<Orin IP>:~/JUSH_TWSE/
```

不要把 `node_modules/`、`.venv/`、`dist/` 複製過去，Orin 是 ARM（aarch64），那些要在 Orin 上重新產生。

## 2. 安裝 Python 環境（需要 Python 3.12）

JetPack 內建的 Python 通常比較舊，用 `uv` 裝 3.12 最省事：

```bash
curl -LsSf https://astral.sh/uv/install.sh | sh
cd ~/JUSH_TWSE
uv venv --python 3.12 .venv
uv pip install --python .venv/bin/python -r requirements.txt
```

## 3. 編譯前端

需要 Node.js 20.19 以上（Vite 8 的要求）：

```bash
npm ci
VITE_API_URL= npm run build      # 留空：前端所有請求都打 Orin 自己，不再繞去 Render
```

如果不想在 Orin 上裝 Node，也可以在你電腦上 `npm run build` 後，把 `dist/` 用 scp 傳過去。

## 4. 環境變數

在 `~/JUSH_TWSE/.env` 寫入（這個檔案已被 `.gitignore` 排除）：

```bash
LLM_BASE_URL=http://<Spark 的 Tailscale IP>:11434
# LLM_MODEL=qwen3.6:35b-a3b-mtp-q8_0   # 預設就是這個
FINMIND_API_TOKEN=<你的 FinMind token>
ADMIN_SYNC_SECRET=<自訂的管理密碼>
```

Firebase 憑證讀專案根目錄的 `serviceAccountKey.json`（第 1 步複製的那份）。

先確認 Orin 連得到 Spark 的模型：

```bash
curl http://<Spark 的 Tailscale IP>:11434/api/tags
```

清單裡要看得到 `qwen3.6:35b-a3b-mtp-q8_0`。連不到的話，檢查 Spark 上的 Ollama 是不是只聽 `127.0.0.1`，
要設 `OLLAMA_HOST=0.0.0.0:11434` 再重啟 Ollama。

## 5. 先手動跑一次

```bash
cd ~/JUSH_TWSE
set -a; . ./.env; set +a
.venv/bin/python -m src.backend.web_app
```

用瀏覽器開 `http://<Orin 的 Tailscale IP>:8000`。打開 `http://<Orin>:8000/api/admin/sync-status`，
`llm_provider` 應該是 `ollama`、`llm_model` 是 `qwen3.6:35b-a3b-mtp-q8_0`。

## 6. 設成開機自動啟動（systemd）

`/etc/systemd/system/jush-twse.service`：

```ini
[Unit]
Description=JUSH TWSE
After=network-online.target tailscaled.service
Wants=network-online.target

[Service]
User=<帳號>
WorkingDirectory=/home/<帳號>/JUSH_TWSE
EnvironmentFile=/home/<帳號>/JUSH_TWSE/.env
ExecStart=/home/<帳號>/JUSH_TWSE/.venv/bin/python -m src.backend.web_app
Restart=on-failure

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now jush-twse
journalctl -u jush-twse -f        # 看 log
```

## 之後更新

```bash
cd ~/JUSH_TWSE && git pull
uv pip install --python .venv/bin/python -r requirements.txt
VITE_API_URL= npm run build
sudo systemctl restart jush-twse
```
