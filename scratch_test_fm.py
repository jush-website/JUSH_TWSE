import time
from FinMind.data import DataLoader

dl = DataLoader()

stock_id = "2330"
start_date = "2026-05-01"

try:
    print("1. TaiwanStockInstitutionalInvestorsBuySell")
    df = dl.taiwan_stock_institutional_investors(stock_id=stock_id, start_date=start_date)
    print(df.tail(2) if df is not None and not df.empty else "Empty")
except Exception as e: print("Error:", e)

try:
    print("\n2. TaiwanStockMarginPurchaseShortSale")
    df = dl.taiwan_stock_margin_purchase_short_sale(stock_id=stock_id, start_date=start_date)
    print(df.tail(2) if df is not None and not df.empty else "Empty")
except Exception as e: print("Error:", e)

try:
    print("\n3. TaiwanStockShareholding")
    df = dl.taiwan_stock_shareholding(stock_id=stock_id, start_date=start_date)
    print(df.tail(2) if df is not None and not df.empty else "Empty")
except Exception as e: print("Error:", e)

