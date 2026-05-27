import time
from src.backend.data_fetcher import DataFetcher
from src.backend.analyzer import StockAnalyzer

fetcher = DataFetcher()
analyzer = StockAnalyzer(fetcher)

print("--- Profiling Homepage Status ---")
start = time.time()
fetcher.get_market_status()
fetcher.get_taiex_data(days=1)
print(f"Status took: {time.time() - start:.3f}s")

print("--- Profiling Global Market ---")
start = time.time()
fetcher.get_global_markets()
print(f"Global Market took: {time.time() - start:.3f}s")

print("--- Profiling Futures ---")
start = time.time()
fetcher.get_realtime_wtx()
print(f"Futures took: {time.time() - start:.3f}s")

print("--- Profiling Recommendations ---")
start = time.time()
try:
    from src.backend.get_recommendations import get_all_recommendations
    get_all_recommendations()
except Exception as e:
    print("Error:", e)
print(f"Recommendations took: {time.time() - start:.3f}s")

print("--- Profiling Stock Analyze (2330) ---")
start = time.time()
analyzer.analyze("2330")
print(f"Analyze took: {time.time() - start:.3f}s")
