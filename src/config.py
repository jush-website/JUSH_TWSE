# Configuration for StockAnalysis system

# API Endpoints
TWSE_VALUATION_URL = "https://openapi.twse.com.tw/v1/exchangeReport/BWIBBU_ALL"
TWSE_DAY_ALL_URL = "https://openapi.twse.com.tw/v1/exchangeReport/STOCK_DAY_ALL"
TWSE_NEWS_URL = "https://openapi.twse.com.tw/v1/news/newsList"

TPEX_VALUATION_URL = "https://www.tpex.org.tw/openapi/v1/tpex_mainboard_peratio_analysis"
TPEX_DAY_ALL_URL = "https://www.tpex.org.tw/openapi/v1/tpex_mainboard_quotes"

# Analysis Parameters
PE_RATIO_DEFAULT = "N/A"
YIELD_DEFAULT = "0.0"
MAX_STOCK_PRICE_FOR_ST_REC = 5000
TOP_HOT_BATTLEFIELD_LIMIT = 150
BATCH_SIZE_SYNC = 200
LOW_PE_THRESHOLD = 10.0  # 分析師推薦：本益比極低標的
MAX_BIAS_MA5 = 0.05      # 5日線乖離率閾值 (5%)，超過視為追高

# Technical Indicator Settings
KD_WINDOW = 9
KD_M1 = 3
KD_M2 = 3
RSI_WINDOW = 6
MACD_FAST = 12
MACD_SLOW = 26
MACD_SIGNAL = 9
BOLLINGER_WINDOW = 20
BOLLINGER_STD = 2

# Target Brokers for Overnight Momentum Analysis
TARGET_BROKERS = [
    "凱基-台北", "富邦-建國", "元大-土城永寧", "群益金鼎-大安", 
    "凱基-松山", "富邦-嘉義", "凱基-嘉義", "摩根大通", "美商美林", "美商高盛"
]

import os
import shutil

# Base Directory
BASE_DIR = os.path.dirname(os.path.abspath(__file__))

# Cache Settings
if os.environ.get("VERCEL"):
    CACHE_DIR = "/tmp/cache"
    # 在 Vercel 環境，將預先打包的快取檔案種子化到可寫入的 /tmp
    bundled_cache_dir = os.path.join(BASE_DIR, "cache")
    if not os.path.exists(CACHE_DIR):
        os.makedirs(CACHE_DIR, exist_ok=True)
    if os.path.exists(bundled_cache_dir):
        for filename in os.listdir(bundled_cache_dir):
            src_file = os.path.join(bundled_cache_dir, filename)
            dst_file = os.path.join(CACHE_DIR, filename)
            if not os.path.exists(dst_file):
                try:
                    shutil.copy2(src_file, dst_file)
                except Exception as e:
                    print(f"Error seeding cache file {filename}: {e}")
else:
    CACHE_DIR = os.path.join(BASE_DIR, "cache")
    if not os.path.exists(CACHE_DIR):
        os.makedirs(CACHE_DIR, exist_ok=True)

INTRADAY_CACHE_EXPIRY = 900 # 15 minutes
HISTORY_CACHE_EXPIRY = 3600 * 4 # 4 hours for history metadata

# Long-term Investment Target Stocks
LONG_TERM_STOCK_IDS = [
    "2330", "2884", "2412", "2308", "2317", "2881", 
    "2882", "2886", "2002", "0050", "0056", "00878"
]

# Evaluation Scores
TREND_SCORE_FULL = 40
TREND_SCORE_HALF = 30
TREND_SCORE_LOW = 15
MOMENTUM_SCORE_HIGH = 30
MOMENTUM_SCORE_LOW = 15
CHIP_SCORE_HIGH = 30
CHIP_SCORE_MID = 20
CHIP_SCORE_LOW = 10
ST_REC_THRESHOLD_HIGH = 70
ST_REC_THRESHOLD_MID = 50

# Dynamic Recommendation Settings
MIN_REC_COUNT = 3               # 每個分類最少推薦數量
REC_SCORE_FLOOR = 25            # 即使行情差，最低也要有 25 分才推薦
MARKET_SENTIMENT_WEIGHT = 0.8   # 行情不好時，門檻縮減的權重 (0.8 代表門檻變為 0.8 倍)
