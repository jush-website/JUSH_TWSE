import asyncio; from src.backend.web_app import fetcher, fetch_all, loop, executor; sid='2883'; d_price='2024'; df=fetcher.get_price_data(sid, 90); print('price_data len:', len(df))
