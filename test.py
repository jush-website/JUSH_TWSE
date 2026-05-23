import asyncio
from src.backend.data_fetcher import DataFetcher
from src.backend.analyzer import StockAnalyzer

async def test():
    f = DataFetcher()
    a = StockAnalyzer(f)
    f.fetch_twse_openapi(fetch_all=False)
    hot = f.get_top_gainer_ids(limit=10)
    print(f"Top gainers: {hot}")
    for sid in hot:
        df = f.get_price_data(sid, days=30)
        intra = f.get_intraday_data(sid)
        if intra: intra['stock_id'] = sid
        res = a.evaluate_overnight_momentum(df, intra)
        print(f"[{sid}] Score: {res.get('score')} Status: {res.get('status')} Signals: {res.get('signals')}")

asyncio.run(test())
