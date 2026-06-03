import os
import requests
import json
from dotenv import load_dotenv

load_dotenv()

token = os.environ.get("FINMIND_API_TOKEN")
print(f"Token: {token[:5]}...{token[-5:]}" if token else "No token found in .env or environ")

url = "https://api.finmindtrade.com/api/v4/data"
params = {
    "dataset": "TaiwanStockNews",
    "data_id": "2330",
    "start_date": "2026-06-01"
}
if token:
    params["token"] = token

response = requests.get(url, params=params)
data = response.json()
print("Msg:", data.get("msg"))
print("Status:", data.get("status"))
print("User Count:", data.get("user_count", "Not provided in response"))
