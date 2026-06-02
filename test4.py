import asyncio
from src.backend.web_app import get_raw_data
import json

async def main():
 res = await get_raw_data('0050')
 print('ETF PER length:', len(res.get('per_data', [])))

asyncio.run(main())
