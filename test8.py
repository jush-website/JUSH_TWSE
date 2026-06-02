import asyncio
from src.backend.web_app import get_raw_data
import json

async def main():
    res = await get_raw_data('2317')
    print('Keys:', res.keys())
    print('News length:', len(res.get('news_data', [])))
    print('Revenue length:', len(res.get('revenue_data', [])))
    print('Dividend length:', len(res.get('dividend_data', [])))
    print('Financials length:', len(res.get('financial_data', [])))

asyncio.run(main())
