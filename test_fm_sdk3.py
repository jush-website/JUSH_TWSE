from FinMind.data import DataLoader
dl = DataLoader()

# Try to get user_count
api = getattr(dl, "finmind_api", None)
if api:
    print("User Count attribute:", getattr(api, "user_count", "Not found"))

# Try to fetch and then see if user_count is updated
dl.taiwan_stock_info()
print("User Count attribute after fetch:", getattr(api, "user_count", "Not found"))
