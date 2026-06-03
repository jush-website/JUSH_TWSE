from FinMind.data import DataLoader
import os

dl = DataLoader()
api = getattr(dl, "finmind_api", None) or getattr(dl, "api", None)
if api:
    print("Has token in SDK?", hasattr(api, "token"))
    if hasattr(api, "token"):
        print("Token value:", api.token)

# Try to find what environment variables FinMind uses
print("FINMIND_API_TOKEN in env:", "FINMIND_API_TOKEN" in os.environ)
