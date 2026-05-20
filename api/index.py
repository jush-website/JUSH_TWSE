import sys
import os
import traceback

# 將專案根目錄加入路徑
root_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.append(root_dir)

try:
    from src.web_app import app
except Exception as e:
    print(f"Error importing app: {e}")
    print(traceback.format_exc())
    # 這裡不要定義新的 app，讓 Vercel 噴出 import error 比較好除錯
    raise

# Vercel ASGI 進入點
