import pandas as pd
from data_fetcher import DataFetcher
from analyzer import StockAnalyzer
import config
import json

def diagnostic_report():
    fetcher = DataFetcher()
    analyzer = StockAnalyzer(fetcher=fetcher)
    
    print("=== 1. DataFetcher State ===")
    print(f"Official cache size: {len(fetcher._official_cache)}")
    if fetcher._official_cache:
        sample_key = list(fetcher._official_cache.keys())[0]
        print(f"Sample data date in cache: {fetcher._official_cache[sample_key].get('date')}")
    
    print("\n=== 2. Testing get_hot_battlefield_ids ===")
    sids = fetcher.get_hot_battlefield_ids()
    print(f"Total Hot IDs found: {len(sids)}")
    if not sids:
        print("CRITICAL: Hot ID list is empty!")
        # Try to force sync
        fetcher.fetch_twse_openapi()
        sids = fetcher.get_hot_battlefield_ids()
        print(f"Retrying Hot IDs: {len(sids)}")
    
    if not sids: return

    test_sids = sids[:10]
    print(f"\n=== 3. Analyzing top {len(test_sids)} stocks ===")
    
    fetcher.prefetch_data(test_sids)
    fetcher.prefetch_intraday_data(test_sids)
    
    for sid in test_sids:
        print(f"\n--- Analysis for {sid} ---")
        snapshot = fetcher.get_intraday_data(sid)
        if snapshot: snapshot['stock_id'] = sid
        
        res = analyzer.analyze(sid, intraday_snapshot=snapshot)
        if "error" in res:
            print(f"  Error: {res['error']}")
            continue
            
        print(f"  Price: {res['price']}, Change: {res['change_percent']}%")
        print(f"  Short-term Score: {res['short_term_rec']['score']}, Status: {res['short_term_rec']['status']}")
        print(f"  Overnight Score: {res['overnight']['score']}, Signals: {res['overnight']['signals']}")
        print(f"  Diagnosis: {res['diagnosis'][:3]}")
        
        # Check why it might be filtered out in Function 2
        if res['price'] > config.MAX_STOCK_PRICE_FOR_ST_REC:
            print(f"  [!] Filtered out from Func 2: Price > {config.MAX_STOCK_PRICE_FOR_ST_REC}")
        
        # Check Function 6 criteria (overnight score >= 45)
        if res['overnight']['score'] < 45:
            print(f"  [!] Filtered out from Func 6: Overnight score < 45")
        if res.get('is_limit_up'):
            print(f"  [!] Filtered out from Func 6: Is Limit Up")

if __name__ == "__main__":
    diagnostic_report()
