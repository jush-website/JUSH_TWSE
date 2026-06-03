import time
from FinMind.data import DataLoader
import json

dl = DataLoader()
stock_id = "2330"
start_date = "2026-05-01"

out = {}
df1 = dl.taiwan_stock_institutional_investors(stock_id=stock_id, start_date=start_date)
out["institutional"] = list(df1.columns) if df1 is not None else []

df2 = dl.taiwan_stock_margin_purchase_short_sale(stock_id=stock_id, start_date=start_date)
out["margin"] = list(df2.columns) if df2 is not None else []

df3 = dl.taiwan_stock_shareholding(stock_id=stock_id, start_date=start_date)
out["shareholding"] = list(df3.columns) if df3 is not None else []

print(json.dumps(out, indent=2))
