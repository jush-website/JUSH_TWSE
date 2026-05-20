import sys
import os

# 將專案根目錄加入路徑，以便導入 src
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from src.web_app import app

# Vercel 會自動尋找名為 app 的 ASGI 物件
