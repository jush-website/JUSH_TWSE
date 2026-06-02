import asyncio
from src.backend.web_app import (
    get_short_term_recommendations, get_overnight_recommendations,
    get_bottom_fishing_recommendations, get_short_term_burst_recommendations,
    get_long_term_recommendations, get_etf_recommendations, get_cdp_recommendations,
    get_capital_flow_recommendations,
    firebase_db, firestore, fetcher
)

async def force_push():
    print("Fetching data...")
    long_term = await get_long_term_recommendations(force=True)
    short_term = await get_short_term_recommendations(force=True)
    bottom_fishing = await get_bottom_fishing_recommendations(force=True)
    short_term_burst = await get_short_term_burst_recommendations(force=True)
    overnight_1 = await get_overnight_recommendations(mode='1', force=True)
    overnight_2 = await get_overnight_recommendations(mode='2', force=True)
    cdp = await get_cdp_recommendations(force=True)
    etf = await get_etf_recommendations(force=True)
    capital_flow = await get_capital_flow_recommendations(force=True)
    
    if firebase_db:
        base_date = fetcher.get_last_expected_trading_date().strftime('%Y-%m-%d')
        def update_doc(doc_id, data_list):
            firebase_db.collection('recommendations').document(doc_id).set({
                'data': data_list, 
                'base_date': base_date, 
                'updated_at': firestore.SERVER_TIMESTAMP
            })
        loop = asyncio.get_event_loop()
        tasks = [
            loop.run_in_executor(None, update_doc, d, l) for d, l in [
                ('long_term', long_term), ('short_term', short_term),
                ('bottom_fishing', bottom_fishing), ('short_term_burst', short_term_burst),
                ('overnight_1', overnight_1), ('overnight_2', overnight_2),
                ('cdp', cdp), ('etf', etf), ('capital_flow', capital_flow)
            ]
        ]
        await asyncio.gather(*tasks)
        print('Firebase Push Success!')
    else:
        print("Firebase DB not initialized!")

if __name__ == "__main__":
    asyncio.run(force_push())
