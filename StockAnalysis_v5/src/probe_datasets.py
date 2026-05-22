import requests
import urllib3
import pandas as pd
from datetime import datetime, timedelta

urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

def probe():
    sid = "2330"
    # Try a few historical dates that should definitely have data
    dates = ["2026-05-06", "2026-04-30", "2026-04-23"]
    
    # Candidate datasets from the 422 error list
    candidates = [
        "TaiwanStockStatisticsOfOrderBookAndTrade",
        "TaiwanStockBlockTrade",
        "TaiwanStockBlockTradingDailyReport",
        "TaiwanStockPrice", # Just for baseline
    ]
    
    url = "https://api.finmindtrade.com/api/v4/data"
    
    for date in dates:
        print(f"\n--- Probing Date: {date} ---")
        for dataset in candidates:
            params = {
                "dataset": dataset,
                "stock_id": sid,
                "date": date
            }
            try:
                res = requests.get(url, params=params, verify=False, timeout=10)
                if res.status_code == 200:
                    data = res.json().get('data', [])
                    print(f"[{dataset}] Success! Found {len(data)} rows.")
                    if data:
                        print(f"  Sample Columns: {list(data[0].keys())}")
                        if len(data) > 100: # Likely broker trades
                            print(f"  [!] THIS MIGHT BE IT. Row count: {len(data)}")
                else:
                    print(f"[{dataset}] Failed. Status: {res.status_code}. Msg: {res.text[:100]}")
            except Exception as e:
                print(f"[{dataset}] Error: {e}")

if __name__ == "__main__":
    probe()
