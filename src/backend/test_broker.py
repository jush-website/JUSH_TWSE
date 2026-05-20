from src.backend import config
from src.backend.data_fetcher import DataFetcher
import pandas as pd

def test():
    fetcher = DataFetcher()
    sid = "2330"
    date = "2026-05-06"
    print(f"Testing taiwan_stock_book_and_trade for {sid} on {date}...")
    try:
        df = fetcher.fm_loader.taiwan_stock_book_and_trade(stock_id=sid, date=date)
        if not df.empty:
            print(f"Success! Rows: {len(df)}")
            print(f"Columns: {df.columns.tolist()}")
            print(df.head(2))
        else:
            print("Returned EMPTY.")
    except Exception as e:
        print(f"Error: {e}")


if __name__ == "__main__":
    test()
