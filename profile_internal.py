import time
from src.backend.data_fetcher import DataFetcher

fetcher = DataFetcher()

start = time.time()
fetcher.get_intraday_data("2330")
print(f"intraday took {time.time() - start:.3f}s")

start = time.time()
fetcher.get_price_data("2330", 250)
print(f"price took {time.time() - start:.3f}s")

start = time.time()
fetcher.get_chip_data("2330", 10)
print(f"chip took {time.time() - start:.3f}s")

start = time.time()
fetcher.get_margin_data("2330", 5)
print(f"margin took {time.time() - start:.3f}s")

start = time.time()
fetcher.get_stock_volatility("2330")
print(f"volatility took {time.time() - start:.3f}s")
