import sys
import os
import traceback

# 將專案根目錄及 src/backend 目錄加入路徑
root_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
backend_dir = os.path.join(root_dir, "src", "backend")
sys.path.insert(0, root_dir)
sys.path.insert(0, backend_dir)

try:
    from src.backend.web_app import app
    print("Successfully imported app from src.backend.web_app")
except Exception as e:
    print(f"Error importing app: {e}")
    print(traceback.format_exc())
    raise

# Vercel ASGI 進入點
