import asyncio
from src.backend.web_app import get_raw_data
import json

async def main():
 res = await get_raw_data('2330')
 print(json.dumps(res, ensure_ascii=False, indent=2))

asyncio.run(main())
