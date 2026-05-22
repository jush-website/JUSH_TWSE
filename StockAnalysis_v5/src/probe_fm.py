import requests
import urllib3
import pandas as pd
from datetime import datetime, timedelta
from FinMind.data import DataLoader

urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

def probe():
    sid = "2330"
    # Try an older date to check for restrictions
    date = "2024-05-06"
    
    fm_loader = DataLoader()
    print(f"Probing TaiwanStockTradingDailyReport for {sid} on {date}")
    try:
        df = fm_loader.get_data(dataset="TaiwanStockTradingDailyReport", stock_id=sid, date=date)
        if df is not None and not df.empty:
            print(f"Success! Found {len(df)} rows.")
            print(f"Columns: {df.columns.tolist()}")
            print(df.head())
        else:
            print("Failed: Empty dataframe or None.")
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    probe()
