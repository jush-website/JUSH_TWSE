from src.backend.data_fetcher import DataFetcher
from src.backend.analyzer import StockAnalyzer
import time

fetcher = DataFetcher()
analyzer = StockAnalyzer(fetcher)

start = time.time()
intraday = fetcher.get_intraday_data("2330")
res = analyzer.analyze("2330", intraday_snapshot=intraday)
end = time.time()

print(f"Time taken: {end - start:.2f}s")
print("chart_data present?", "chart_data" in res)
if "chart_data" in res:
    print("chart_data length:", len(res["chart_data"]))
    if len(res["chart_data"]) > 0:
        print("Sample:", res["chart_data"][-1])
