import asyncio
from src.backend.web_app import get_raw_data
import json

async def main():
 res = await get_raw_data('2330')
 print('PER length:', len(res.get('per_data', [])))
 if res.get('per_data'): print('Last PER:', res['per_data'][-1])

asyncio.run(main())
