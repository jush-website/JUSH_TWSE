import asyncio
from src.backend.data_fetcher import DataFetcher
from src.backend.analyzer import StockAnalyzer
from src.backend import config

fetcher = DataFetcher()
analyzer = StockAnalyzer(fetcher=fetcher)

def test():
    fetcher.fetch_twse_openapi(fetch_all=False)
    
    # Simulate get_custom_overnight_ids
    hot_ids = fetcher.get_hot_battlefield_ids()[:30]
    hold_ids = []
    if fetcher._official_cache:
        sorted_cache = sorted(fetcher._official_cache.items(), key=lambda x: x[1].get('volume', 0), reverse=True)
        for sid, info in sorted_cache:
            if sid == "TAIEX" or fetcher.is_etf(sid): continue
            cp = info.get("change_pct", 0)
            price = info.get("price", 0)
            vol = info.get("volume", 0)
            if cp >= 7.5 and price <= config.MAX_STOCK_PRICE_FOR_ST_REC and vol >= 10000:
                hold_ids.append(sid)
                
    combined = list(dict.fromkeys(hold_ids + hot_ids))[:60]
    print(f"Candidates to analyze: {len(combined)}")
    print(f"Hold IDs (>=7.5%, >=10k vol): {hold_ids}")
    
    fetcher.prefetch_data(combined)
    results = []
    for sid in combined:
        snapshot = fetcher.get_intraday_data(sid)
        if snapshot: snapshot['stock_id'] = sid
        res = analyzer.analyze(sid, intraday_snapshot=snapshot)
        if res and "error" not in res and res['price'] < 1000:
            results.append(res)
            
    print(f"Valid results after analyzer: {len(results)}")
    
    # Filter like web_app
    results.sort(key=lambda x: x['overnight']['score'], reverse=True)
    top = [r for r in results if r['overnight']['score'] >= 40][:30]
    if not top and results:
        top = [r for r in results if r['overnight']['score'] > 0][:10]
        
    print(f"Top results (score >= 40): {len(top)}")
    for r in top:
        print(f"[{r['code']}] Score: {r['overnight']['score']} Status: {r['overnight']['status']}")
        print(f"    Signals: {r['overnight']['signals']}")
        print("---")

test()
