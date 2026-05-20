from src.backend.data_fetcher import DataFetcher
f = DataFetcher()
methods = [m for m in dir(f) if 'status' in m.lower() or 'market' in m.lower()]
print(methods)
