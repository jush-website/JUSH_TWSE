import sys
import os
import traceback

# 將專案根目錄及 src 目錄加入路徑
root_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
src_dir = os.path.join(root_dir, "src")
sys.path.insert(0, root_dir)
sys.path.insert(0, src_dir)

try:
    from src.web_app import app
    print("Successfully imported app from src.web_app")
except Exception as e:
    print(f"Error importing app: {e}")
    print(traceback.format_exc())
    # 這裡不要定義新的 app，讓 Vercel 噴出 import error 比較好除錯
    raise

# Vercel ASGI 進入點
