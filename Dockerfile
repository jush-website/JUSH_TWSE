# 使用官方 Python 映像檔
FROM python:3.10-slim

# 設定工作目錄
WORKDIR /code

# 安裝系統依賴 (針對某些 Python 套件編譯需要)
RUN apt-get update && apt-get install -y \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

# 複製 requirements.txt 並安裝
COPY ./requirements.txt /code/requirements.txt
RUN pip install --no-cache-dir --upgrade -r /code/requirements.txt

# 建立快取資料夾
RUN mkdir -p /code/src/cache && chmod 777 /code/src/cache

# 複製所有程式碼
COPY . /code

# 設定環境變數
ENV PYTHONUNBUFFERED=1
ENV PORT=7860

# 啟動 FastAPI (Hugging Face 預設使用 7860 端口)
CMD ["uvicorn", "src.web_app:app", "--host", "0.0.0.0", "--port", "7860"]
