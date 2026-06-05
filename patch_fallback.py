import os

file_path = "src/backend/data_fetcher.py"
with open(file_path, "r", encoding="utf-8") as f:
    content = f.read()

target = '''                if df is not None and not df.empty:
                    df = df.rename(columns={'date': 'Date', 'open': 'Open', 'max': 'High', 'min': 'Low', 'close': 'Close', 'Trading_Volume': 'Volume'})
                    for col in ['Open', 'High', 'Low', 'Close']:
                        df[col] = pd.to_numeric(df[col], errors='coerce').round(2)
                    df['Volume'] = pd.to_numeric(df['Volume'], errors='coerce')
                    df = df.dropna(subset=['Close'])
                    df['Date'] = pd.to_datetime(df['Date']).dt.tz_localize(None)
                    df = df[["Date", "Open", "High", "Low", "Close", "Volume"]].set_index('Date')'''

replacement = '''                if df is not None and not df.empty:
                    df = df.rename(columns={'date': 'Date', 'open': 'Open', 'max': 'High', 'min': 'Low', 'close': 'Close', 'Trading_Volume': 'Volume'})
                    for col in ['Open', 'High', 'Low', 'Close']:
                        df[col] = pd.to_numeric(df[col], errors='coerce').round(2)
                    df['Volume'] = pd.to_numeric(df['Volume'], errors='coerce')
                    df = df.dropna(subset=['Close'])
                    df['Date'] = pd.to_datetime(df['Date']).dt.tz_localize(None)
                    df = df[["Date", "Open", "High", "Low", "Close", "Volume"]].set_index('Date')
                else:
                    symbols = []
                    sym_map_val = self.get_symbol_map().get(stock_id)
                    if sym_map_val: symbols.append(sym_map_val)
                    symbols.extend([f"{stock_id}.TW", f"{stock_id}.TWO"])
                    for sym in symbols:
                        try:
                            import yfinance as yf
                            t = yf.Ticker(sym)
                            yf_df = t.history(period="1y", interval="1d", auto_adjust=False)
                            if yf_df is not None and not yf_df.empty:
                                for col in ['Open', 'High', 'Low', 'Close']: yf_df[col] = yf_df[col].round(2)
                                yf_df = yf_df.dropna(subset=['Close']).reset_index()
                                yf_df = yf_df.rename(columns={"Date": "Date"})
                                yf_df['Date'] = pd.to_datetime(yf_df['Date']).dt.tz_localize(None)
                                df = yf_df[["Date", "Open", "High", "Low", "Close", "Volume"]].set_index('Date')
                                break
                        except:
                            pass'''

if target in content:
    content = content.replace(target, replacement)
    with open(file_path, "w", encoding="utf-8") as f:
        f.write(content)
    print("PATCH_SUCCESS")
else:
    print("TARGET_NOT_FOUND")
