from src.backend.data_fetcher import DataFetcher
f = DataFetcher()
print(f.fm_loader.taiwan_stock_per_pbr(stock_id='2330', start_date='2024-05-01'))
