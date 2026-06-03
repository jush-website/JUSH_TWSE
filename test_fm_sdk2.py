from FinMind.data import DataLoader
dl = DataLoader()

# Let's see what attributes it has
api = getattr(dl, "finmind_api", None) or getattr(dl, "api", None)
if api:
    print("API Token:", getattr(api, "token", None))

df = dl.taiwan_stock_info()
print("Data size:", len(df))
