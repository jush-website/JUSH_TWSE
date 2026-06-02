from src.backend.data_fetcher import DataFetcher
from datetime import datetime, timedelta
f = DataFetcher()
sid='2330'
d_per = (datetime.now() - timedelta(days=30)).strftime('%Y-%m-%d')
df = f.fm_loader.taiwan_stock_per_pbr(stock_id=sid, start_date=d_per)
print('Length:', len(df) if df is not None else 'None')
print(df.tail() if df is not None and not df.empty else 'Empty')
