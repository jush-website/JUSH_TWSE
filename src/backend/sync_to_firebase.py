import os
import sys
import time
import math
import logging
import asyncio

# Setup logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')

# Add project root to path
sys.path.append(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

try:
    import firebase_admin
    from firebase_admin import credentials, firestore
except ImportError:
    logging.error("firebase-admin is not installed. Run: pip install firebase-admin")
    sys.exit(1)

from src.backend import config
from src.backend.data_fetcher import DataFetcher
from src.backend.analyzer import StockAnalyzer
from concurrent.futures import ThreadPoolExecutor

# Initialize Firebase Admin
cred_path = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))), 'serviceAccountKey.json')
if not os.path.exists(cred_path):
    logging.error(f"Cannot find serviceAccountKey.json at {cred_path}.")
    logging.error("Please download the Service Account JSON from Firebase Console -> Project Settings -> Service Accounts, and save it in the project root.")
    sys.exit(1)

cred = credentials.Certificate(cred_path)
firebase_admin.initialize_app(cred)
db = firestore.client()

fetcher = DataFetcher()
analyzer = StockAnalyzer(fetcher)
executor = ThreadPoolExecutor(max_workers=30)

def sanitize_data(data):
    if isinstance(data, dict):
        return {k: sanitize_data(v) for k, v in data.items()}
    elif isinstance(data, list):
        return [sanitize_data(v) for v in data]
    elif isinstance(data, float):
        if math.isnan(data) or math.isinf(data): return None
        return data
    else:
        return data

async def run_sync():
    logging.info("Starting sync to Firebase...")
    try:
        loop = asyncio.get_event_loop()
        
        # 1. Update Status
        status = fetcher.get_system_status()
        db.collection('system').document('status').set(sanitize_data(status))
        logging.info("Status synced.")
        
        # 2. Get target SIDs for strategies
        # Hot stocks typically use the top 50~100.
        sids = await loop.run_in_executor(executor, lambda: fetcher.get_hot_battlefield_ids()[:80])
        await loop.run_in_executor(executor, lambda: fetcher.prefetch_data(sids))
        await loop.run_in_executor(executor, lambda: fetcher.prefetch_intraday_data(sids))
        
        tasks = []
        for sid in sids:
            tasks.append(loop.run_in_executor(executor, analyzer.analyze, sid))
        all_res = await asyncio.gather(*tasks)
        results = [res for res in all_res if res and "error" not in res]
        
        # a) Short Term (短線衝刺)
        st_results = [res for res in results if res['price'] <= config.MAX_STOCK_PRICE_FOR_ST_REC]
        st_results.sort(key=lambda x: x["short_term_rec"]["score"], reverse=True)
        db.collection('recommendations').document('short_term').set({"data": sanitize_data(st_results[:20])})
        
        # b) Bottom Fishing (抄底)
        bf_results = sorted(results, key=lambda x: x["bottom_fishing_rec"]["score"], reverse=True)
        db.collection('recommendations').document('bottom_fishing').set({"data": sanitize_data([r for r in bf_results if r["bottom_fishing_rec"]["score"] >= 50][:20])})
        
        # c) Short Term Burst (強勢爆發)
        stb_results = sorted(results, key=lambda x: x["short_term_burst_rec"]["score"], reverse=True)
        db.collection('recommendations').document('short_term_burst').set({"data": sanitize_data([r for r in stb_results if r["short_term_burst_rec"]["score"] >= 60][:20])})
        
        # d) Overnight (隔日沖)
        # 盤中強勢 mode 1
        ov_1 = sorted(results, key=lambda x: x['overnight']['score'], reverse=True)
        db.collection('recommendations').document('overnight_1').set({"data": sanitize_data([r for r in ov_1 if r['overnight']['score'] >= 45 and not r['is_limit_up']][:30])})
        # 盤後籌碼 mode 2
        ov_2 = sorted(results, key=lambda x: x['overnight'].get('broker_ratio', 0), reverse=True)
        top_ov_2 = [r for r in ov_2 if r['overnight'].get('broker_ratio', 0) > 3][:30]
        if not top_ov_2:
            top_ov_2 = [r for r in ov_2 if r['overnight']['score'] >= 50][:30]
        db.collection('recommendations').document('overnight_2').set({"data": sanitize_data(top_ov_2)})
        
        # e) CDP
        cdp_hit = [r for r in results if r['cdp'].get('signals')]
        db.collection('recommendations').document('cdp').set({"data": sanitize_data(cdp_hit if cdp_hit else results[:20])})
        
        logging.info("Recommendations synced to Firebase.")
        
        # f) Long term
        lt_sids = config.LONG_TERM_STOCK_IDS
        await loop.run_in_executor(executor, lambda: fetcher.prefetch_data(lt_sids))
        lt_tasks = [loop.run_in_executor(executor, analyzer.analyze, sid) for sid in lt_sids]
        lt_res = await asyncio.gather(*lt_tasks)
        db.collection('recommendations').document('long_term').set({"data": sanitize_data([r for r in lt_res if r and "error" not in r])})
        
        # g) ETF
        # Fetching ETF involves a different subset, let's just do a basic fetch or use cache if needed.
        # But wait, ETF requires specific ETF IDs. For now, we skip or use a predefined list.
        
        logging.info("Sync completed successfully.")
    except Exception as e:
        logging.error(f"Error during sync: {e}", exc_info=True)

def job():
    asyncio.run(run_sync())

if __name__ == "__main__":
    job()
    try:
        import schedule
        schedule.every(3).minutes.do(job)
        while True:
            schedule.run_pending()
            time.sleep(1)
    except ImportError:
        logging.info("schedule package not found, running once and exiting. Run 'pip install schedule' for recurring execution.")
