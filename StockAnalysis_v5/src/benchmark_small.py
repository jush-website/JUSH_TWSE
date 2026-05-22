import time
from data_fetcher import DataFetcher
from analyzer import StockAnalyzer

def benchmark():
    fetcher = DataFetcher()
    analyzer = StockAnalyzer()
    analyzer.fetcher = fetcher
    
    sids = ["2330", "2317", "2454", "2303", "2603", "2609", "3231", "2382", "2356", "1513"]
    
    print(f"Benchmarking {len(sids)} stocks with prefetch...")
    start_time = time.time()
    
    fetcher.prefetch_data(sids)
    
    results = []
    for sid in sids:
        print(f"Analyzing {sid}...")
        res = analyzer.analyze(sid)
        results.append(res)
        
    end_time = time.time()
    print(f"Total time for {len(sids)} stocks: {end_time - start_time:.2f} seconds")
    print(f"Average time per stock: {(end_time - start_time) / len(sids):.2f} seconds")

if __name__ == "__main__":
    benchmark()
