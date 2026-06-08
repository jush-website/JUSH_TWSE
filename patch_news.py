import re

with open('src/backend/web_app.py', 'r', encoding='utf-8') as f:
    code = f.read()

new_get_news = """def get_news():
            try:
                df = fetcher.fm_loader.get_data(dataset='TaiwanStockNews', data_id=sid, start_date=d_news)
                if df is not None and not df.empty:
                    # FinMind 回傳的資料是依時間從舊到新，且可能很多，我們反轉並取最新 20 筆
                    records = df.fillna("").to_dict('records')
                    records.reverse()
                    return records[:20]
                return []
            except Exception as e:
                print(f"FinMind news error: {e}")
                return []"""

# Replace the inner get_news
# Let's find def get_news(): inside get_raw_data
code = re.sub(r'def get_news\(\):\s*try:\s*import requests[\s\S]*?except: return \[\]', new_get_news, code)

with open('src/backend/web_app.py', 'w', encoding='utf-8') as f:
    f.write(code)

print("get_news patched!")
