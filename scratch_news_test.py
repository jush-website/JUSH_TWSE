from src.backend.data_fetcher import DataFetcher

f = DataFetcher()

try:
    df = f.fm_loader.get_data(dataset='TaiwanStockNews', data_id='2330')
    if df is not None and not df.empty:
        print(f"Total: {len(df)}, First date: {df.iloc[0]['date']}, Last date: {df.iloc[-1]['date']}")
    else:
        print("No data")
except Exception as e:
    print(f"Error: {e}")
