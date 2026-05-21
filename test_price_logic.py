import pandas as pd
import yfinance as yf
from datetime import datetime
import pytz
import sys

sys.path.insert(0, ".")
from src.backend.data_fetcher import DataFetcher

f = DataFetcher()

stock_id = '2330'
expected_date = f.get_last_expected_trading_date()
expected_date_str = expected_date.strftime("%Y-%m-%d")

now = datetime.now(pytz.timezone("Asia/Taipei"))
market_close = now.replace(hour=13, minute=31, second=0, microsecond=0)

is_early_morning = now.hour < 9
is_weekend = now.weekday() >= 5
is_market_hours = (not is_weekend) and (not is_early_morning) and (now < market_close)

sym_map = f.get_symbol_map(); symbol = sym_map.get(stock_id, f"{stock_id}.TW")
t = yf.Ticker(symbol)
df = t.history(period="5d", interval="1m", auto_adjust=False)
df.index = df.index.tz_convert("Asia/Taipei")
all_dates = sorted(df.index.normalize().unique())
expected_date_ts = pd.Timestamp(expected_date, tz="Asia/Taipei")

if expected_date_ts in all_dates:
    price_df = df[df.index.normalize() == expected_date_ts]
else:
    price_df = df[df.index.normalize() == all_dates[-1]]

# 初始現價來自 1m K線最後一筆
last_price = float(price_df['Close'].iloc[-1])

# 嘗試從 yfinance fast_info 或 info 取的最準確現價
# fast_info.last_price 基本上是最即時的盤中價或盤後確認的收盤價
try:
    fast_price = t.fast_info.last_price
    if fast_price and not pd.isna(fast_price):
        last_price = round(float(fast_price), 2)
except:
    try:
        fast_price = t.info.get('regularMarketPrice')
        if fast_price and not pd.isna(fast_price):
            last_price = round(float(fast_price), 2)
    except: pass

# 如果是非盤中，且官方快取有最新收盤資料，強制覆蓋為官方收盤價 (最準確)
if not is_market_hours:
    official_data = f._official_cache.get(stock_id)
    if official_data and official_data.get('date') == expected_date_str:
        if not pd.isna(official_data.get('price')):
            last_price = float(official_data['price'])
else:
    # 盤中，如果官方快取正好是今天 (奇蹟般地提早更新)，覆蓋
    official_data = f._official_cache.get(stock_id)
    if official_data and official_data.get('date') == now.strftime("%Y-%m-%d"):
        if not pd.isna(official_data.get('price')):
            last_price = float(official_data['price'])

print(f"Final last_price: {last_price}")
