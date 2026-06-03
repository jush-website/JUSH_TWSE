from FinMind.data import DataLoader
dl = DataLoader()
print("Has Token?", dl.token is not None)
print("Token:", dl.token[:5] + "..." + dl.token[-5:] if dl.token else None)
