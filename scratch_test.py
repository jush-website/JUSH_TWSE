from src.backend.data_fetcher import DataFetcher
f = DataFetcher()
try:
    df = f.fm_loader.taiwan_stock_margin_purchase_short_sale('2330', '2026-06-18')
    print(df.iloc[0].to_dict())
except Exception as e:
    print(e)
