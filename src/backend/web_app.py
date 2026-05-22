import uvicorn
from fastapi import FastAPI, HTTPException, Query
from fastapi.staticfiles import StaticFiles
from fastapi.responses import HTMLResponse
from typing import List, Optional
import asyncio
import time
import os
import numpy as np
from src.backend import config
import asyncio
from datetime import datetime
import pytz
from contextlib import asynccontextmanager
from concurrent.futures import ThreadPoolExecutor

from src.backend.analyzer import StockAnalyzer
from src.backend.data_fetcher import DataFetcher

import math

def sanitize_data(data):
    if isinstance(data, dict):
        return {k: sanitize_data(v) for k, v in data.items()}
    elif isinstance(data, list):
        return [sanitize_data(v) for v in data]
    elif isinstance(data, (np.bool_, bool)):
        return bool(data)
    elif isinstance(data, (np.integer, int)):
        return int(data)
    elif isinstance(data, (np.floating, float)):
        val = float(data)
        if math.isnan(val) or math.isinf(val):
            return 0.0
        return val
    return data

# 初始化服務
config.seed_cache()
fetcher = DataFetcher()
analyzer = StockAnalyzer(fetcher=fetcher)

import json
import firebase_admin
from firebase_admin import credentials, firestore

# Initialize Firebase Admin securely via environment variable or local file
firebase_db = None
cred_json = os.environ.get("FIREBASE_SERVICE_ACCOUNT")
if cred_json:
    try:
        cred_dict = json.loads(cred_json)
        cred = credentials.Certificate(cred_dict)
        if not firebase_admin._apps:
            firebase_admin.initialize_app(cred)
        firebase_db = firestore.client()
        print("[系統] 已成功透過環境變數初始化 Firebase Admin")
    except Exception as e:
        print(f"[系統] Firebase 初始化失敗 (環境變數): {e}")
else:
    try:
        import os.path
        # current_dir -> src/backend, so root is two levels up
        root_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        # Actually in this file root_dir is defined later, let's just use relative path
        key_path = "serviceAccountKey.json"
        if os.path.exists(key_path):
            cred = credentials.Certificate(key_path)
            if not firebase_admin._apps:
                firebase_admin.initialize_app(cred)
            firebase_db = firestore.client()
            print("[系統] 已成功從本機檔案初始化 Firebase Admin")
        else:
            print("[系統] 警告：找不到 Firebase 憑證 (FIREBASE_SERVICE_ACCOUNT 變數或 serviceAccountKey.json)，將無法同步至資料庫")
    except Exception as e:
        print(f"[系統] Firebase 初始化失敗 (本機檔案): {e}")

@asynccontextmanager
async def lifespan(app: FastAPI):
    # 啟動時執行初步數據同步 (非阻塞方式)
    if not os.environ.get("VERCEL"):
        print("[系統] 正在啟動背景數據同步...")
        loop = asyncio.get_event_loop()
        # 強制啟動時抓取一次台股代號列表，確保 _stock_id_map 完整，避免個股名稱顯示為「未知」
        await loop.run_in_executor(None, fetcher.get_stock_info)
        
        asyncio.create_task(background_sync())
        asyncio.create_task(background_strategies_sync())
    yield

async def background_sync():
    loop = asyncio.get_event_loop()
    while True:
        try:
            await loop.run_in_executor(None, fetcher.sync_if_needed)
        except Exception as e:
            print(f"[系統] 背景同步發生錯誤: {e}")
        await asyncio.sleep(60)

async def background_strategies_sync():
    # 等待初始資料同步完成
    await asyncio.sleep(15)
    last_final_sync_date = None
    last_1330_sync_date = None
    
    while True:
        try:
            now = datetime.now(pytz.timezone("Asia/Taipei"))
            is_weekend = now.weekday() >= 5
            
            # 開盤活躍時段 (08:50 ~ 13:30)
            is_market_hours = not is_weekend and (
                (now.hour == 8 and now.minute >= 50) or 
                (9 <= now.hour < 13) or 
                (now.hour == 13 and now.minute <= 30)
            )
            
            today_str = now.strftime("%Y-%m-%d")
            should_sync = False
            
            if is_market_hours:
                should_sync = True
                print(f"[系統] 目前為開盤時段 ({now.strftime('%H:%M')})，執行 3 分鐘持續更新...")
            else:
                # 確保 13:30 後的最新收盤資料 (大約 13:33~13:35) 有被更新一次，避免只更新到 13:28
                if not is_weekend and now.hour == 13 and now.minute > 30 and last_1330_sync_date != today_str:
                    should_sync = True
                    last_1330_sync_date = today_str
                    print(f"[系統] 盤後確認機制啟動 ({now.strftime('%H:%M')})，確保 13:30 確切收盤數據...")
                # 收盤後防呆：確保在官方收盤資訊與籌碼 (14:30後) 進行一次最終更新，確保是確切的最終收盤數據
                elif last_final_sync_date != today_str:
                    # 若現在已經過了 14:30 (或者是假日的伺服器重啟)，就執行一次最終更新
                    if now.hour > 14 or (now.hour == 14 and now.minute >= 30) or is_weekend:
                        should_sync = True
                        last_final_sync_date = today_str
                        print(f"[系統] 收盤防呆機制啟動 ({now.strftime('%H:%M')})，執行本日確切最終數據更新...")
            
            if should_sync:
                long_term = await get_long_term_recommendations(force=True)
                hot_stocks = await get_hot_stocks(force=True)
                short_term = await get_short_term_recommendations(force=True)
                bottom_fishing = await get_bottom_fishing_recommendations(force=True)
                short_term_burst = await get_short_term_burst_recommendations(force=True)
                overnight_1 = await get_overnight_recommendations(mode="1", force=True)
                overnight_2 = await get_overnight_recommendations(mode="2", force=True)
                cdp = await get_cdp_recommendations(force=True)
                etf = await get_etf_recommendations(force=True)
                
                if firebase_db:
                    base_date = fetcher.get_last_expected_trading_date().strftime("%Y-%m-%d")
                    def update_doc(doc_id, data_list):
                        doc_ref = firebase_db.collection('recommendations').document(doc_id)
                        doc_ref.set({
                            'data': data_list,
                            'base_date': base_date,
                            'updated_at': firestore.SERVER_TIMESTAMP
                        })
                    
                    loop = asyncio.get_event_loop()
                    await loop.run_in_executor(None, update_doc, 'long_term', long_term)
                    await loop.run_in_executor(None, update_doc, 'hot_stocks', hot_stocks)
                    await loop.run_in_executor(None, update_doc, 'short_term', short_term)
                    await loop.run_in_executor(None, update_doc, 'bottom_fishing', bottom_fishing)
                    await loop.run_in_executor(None, update_doc, 'short_term_burst', short_term_burst)
                    await loop.run_in_executor(None, update_doc, 'overnight_1', overnight_1)
                    await loop.run_in_executor(None, update_doc, 'overnight_2', overnight_2)
                    await loop.run_in_executor(None, update_doc, 'cdp', cdp)
                    await loop.run_in_executor(None, update_doc, 'etf', etf)
                    print("[系統] 背景深度策略分析完成，已同步寫入 Firebase Firestore！")
                else:
                    print("[系統] 背景深度策略分析完成 (已快取)，但未同步至 Firebase (無金鑰)")
                    
                await asyncio.sleep(180) # 開盤時或剛更新完，休息 3 分鐘
            else:
                # 不需更新時，進入長休眠 (每 10 分鐘檢查一次時間即可，節省資源)
                print(f"[系統] 已經收盤且更新完畢 (或處於未更新空窗期)，暫停更新機制休眠中 ({now.strftime('%H:%M')})...")
                await asyncio.sleep(600)
                
        except Exception as e:
            print(f"[系統] 背景策略分析與同步錯誤: {e}")
            await asyncio.sleep(180)


from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(title="台股偵測系統 Web 版 (Optimized)", lifespan=lifespan)

# 加入 CORS 設定，允許前端跨域存取
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], # 生產環境建議設定為您的 Vercel 網址
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 掛載前端靜態檔案
# 在 Vercel 環境中，路徑會從根目錄開始計算
current_dir = os.path.dirname(os.path.abspath(__file__))
root_dir = os.path.dirname(current_dir)
frontend_path = os.path.join(root_dir, "frontend", "dist")

if not os.environ.get("VERCEL") and os.path.exists(frontend_path):
    app.mount("/assets", StaticFiles(directory=os.path.join(frontend_path, "assets")), name="assets")



@app.get("/api/status")
async def get_status():
    current_status = fetcher.get_market_status()
    loop = asyncio.get_event_loop()
    
    try:
        sample_df = await loop.run_in_executor(None, lambda: fetcher.get_taiex_data(days=1))
        if not sample_df.empty:
            data_date = sample_df.index[-1].strftime("%Y-%m-%d")
        elif fetcher._official_cache:
            data_date = list(fetcher._official_cache.values())[0].get('date', "確認中...")
        else:
            data_date = fetcher.get_last_expected_trading_date().strftime("%Y-%m-%d")
    except:
        data_date = "確認中..."
    
    return {
        "market_status": current_status,
        "data_date": data_date,
        "server_time": time.time()
    }

@app.get("/api/global-market")
async def get_global_market():
    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(None, fetcher.get_global_markets)

@app.get("/api/news")
async def get_news():
    loop = asyncio.get_event_loop()
    # 獲取台股新聞
    tw_news_items, _ = await loop.run_in_executor(None, fetcher.get_comprehensive_news)
    # 獲取全球新聞
    gl_news_items = await loop.run_in_executor(None, fetcher.get_global_news)
    
    valid_ids = await loop.run_in_executor(None, fetcher.get_all_stock_ids)
    valid_ids = set(valid_ids)
    
    tw_result = []
    for item in tw_news_items:
        import re
        found_ids = [sid for sid in re.findall(r'\d{4}', item.get("title", "")) if sid in valid_ids]
        item["related_stocks"] = found_ids
        tw_result.append(item)
    
    gl_result = gl_news_items
        
    return {"taiwan": tw_result, "global": gl_result}

# 簡單的 API 快取機制，避免頻繁計算導致超時
API_CACHE = {}

def set_cached_response(key, data, expiry=None):
    # 如果未指定 expiry，預設給予極長時間，由背景程式負責更新
    API_CACHE[key] = (time.time() + (expiry or 86400), data)

def get_cached_response(key):
    if key in API_CACHE:
        expire_ts, data = API_CACHE[key]
        if time.time() < expire_ts:
            return data
    return None

executor = ThreadPoolExecutor(max_workers=30)

def analyze_wrap(sid):
    snapshot = fetcher.get_intraday_data(sid)
    if snapshot: snapshot['stock_id'] = sid
    return analyzer.analyze(sid, intraday_snapshot=snapshot)


@app.get("/api/long-term-recommendations")
async def get_long_term_recommendations(force: bool = False):
    if not force:
        cached = get_cached_response("long_term")
        if cached: return cached
    
    loop = asyncio.get_event_loop()
    sids = config.LONG_TERM_STOCK_IDS
    await loop.run_in_executor(executor, lambda: fetcher.prefetch_data(sids))
    
    tasks = []
    for sid in sids:
        tasks.append(loop.run_in_executor(executor, analyze_wrap, sid))
    
    all_res = await asyncio.gather(*tasks)
    results = [res for res in all_res if res and "error" not in res]
    # 長期股通常不特別依照短線分數排序，保持原始精選順序或依照 PE 排序
    final_res = sanitize_data(results)
    set_cached_response("long_term", final_res)
    return final_res

@app.get("/api/hot-stocks")
async def get_hot_stocks(force: bool = False):
    if not force:
        cached = get_cached_response("hot_stocks")
        if cached: return cached
    
    loop = asyncio.get_event_loop()
    sids = await loop.run_in_executor(executor, lambda: fetcher.get_hot_battlefield_ids()[:30])
    await loop.run_in_executor(executor, lambda: fetcher.prefetch_data(sids))
    
    tasks = []
    for sid in sids:
        tasks.append(loop.run_in_executor(executor, analyze_wrap, sid))
    
    results = await asyncio.gather(*tasks)
    final_res = sanitize_data([res for res in results if res and "error" not in res])
    set_cached_response("hot_stocks", final_res)
    return final_res

@app.get("/api/short-term-recommendations")
async def get_short_term_recommendations(force: bool = False):
    if not force:
        cached = get_cached_response("short_term")
        if cached: return cached
    
    loop = asyncio.get_event_loop()
    sids = await loop.run_in_executor(executor, lambda: fetcher.get_hot_battlefield_ids()[:30])
    await loop.run_in_executor(executor, lambda: fetcher.prefetch_data(sids))
    
    tasks = []
    for sid in sids:
        tasks.append(loop.run_in_executor(executor, analyze_wrap, sid))
    
    all_res = await asyncio.gather(*tasks)
    results = [res for res in all_res if res and "error" not in res and res['price'] <= config.MAX_STOCK_PRICE_FOR_ST_REC]
    results.sort(key=lambda x: x["short_term_rec"]["score"], reverse=True)
    final_res = sanitize_data(results[:10])
    set_cached_response("short_term", final_res)
    return final_res

@app.get("/api/bottom-fishing-recommendations")
async def get_bottom_fishing_recommendations(force: bool = False):
    if not force:
        cached = get_cached_response("bottom_fishing")
        if cached: return cached
    
    loop = asyncio.get_event_loop()
    sids = await loop.run_in_executor(executor, lambda: fetcher.get_hot_battlefield_ids()[:40])
    await loop.run_in_executor(executor, lambda: fetcher.prefetch_data(sids))
    
    tasks = []
    for sid in sids:
        tasks.append(loop.run_in_executor(executor, analyze_wrap, sid))
    
    all_res = await asyncio.gather(*tasks)
    results = [res for res in all_res if res and "error" not in res]
    results.sort(key=lambda x: x["bottom_fishing_rec"]["score"], reverse=True)
    top = [r for r in results if r["bottom_fishing_rec"]["score"] >= 50][:20]
    if not top and results:
        top = [r for r in results if r["bottom_fishing_rec"]["score"] > 0][:10]
    final_res = sanitize_data(top)
    set_cached_response("bottom_fishing", final_res)
    return final_res

@app.get("/api/short-term-burst-recommendations")
async def get_short_term_burst_recommendations(force: bool = False):
    if not force:
        cached = get_cached_response("short_term_burst")
        if cached: return cached
    
    loop = asyncio.get_event_loop()
    sids = await loop.run_in_executor(executor, lambda: fetcher.get_hot_battlefield_ids()[:50])
    await loop.run_in_executor(executor, lambda: fetcher.prefetch_data(sids))
    
    tasks = []
    for sid in sids:
        tasks.append(loop.run_in_executor(executor, analyze_wrap, sid))
    
    all_res = await asyncio.gather(*tasks)
    results = [res for res in all_res if res and "error" not in res]
    results.sort(key=lambda x: x["short_term_burst_rec"]["score"], reverse=True)
    top = [r for r in results if r["short_term_burst_rec"]["score"] >= 60][:20]
    if not top and results:
        top = [r for r in results if r["short_term_burst_rec"]["score"] > 0][:10]
    final_res = sanitize_data(top)
    set_cached_response("short_term_burst", final_res)
    return final_res

@app.get("/api/overnight-recommendations")
async def get_overnight_recommendations(mode: str = "1", force: bool = False):
    if not force:
        cached = get_cached_response(f"overnight_{mode}")
        if cached: return cached
    
    loop = asyncio.get_event_loop()
    sids = await loop.run_in_executor(executor, lambda: fetcher.get_hot_battlefield_ids()[:40])
    await loop.run_in_executor(executor, lambda: fetcher.prefetch_data(sids))
    
    def analyze_overnight(sid):
        snapshot = fetcher.get_intraday_data(sid)
        if snapshot: snapshot['stock_id'] = sid
        return analyzer.analyze(sid, intraday_snapshot=snapshot)

    tasks = []
    for sid in sids:
        tasks.append(loop.run_in_executor(executor, analyze_overnight, sid))
    
    all_res = await asyncio.gather(*tasks)
    results = [res for res in all_res if res and "error" not in res and res['price'] < 1000]
            
    if mode == "1": # 盤中強勢
        results.sort(key=lambda x: x['overnight']['score'], reverse=True)
        filtered = [r for r in results if not r['is_limit_up']]
        top = [r for r in filtered if r['overnight']['score'] >= 45][:30]
        if not top and filtered:
            top = [r for r in filtered if r['overnight']['score'] > 0][:10]
        final_res = sanitize_data(top)
    else: # 盤後籌碼
        # 優先依照 broker_ratio 排序
        results.sort(key=lambda x: x['overnight'].get('broker_ratio', 0), reverse=True)
        top = [r for r in results if r['overnight'].get('broker_ratio', 0) > 3][:30]
        
        # 如果沒數據 (受限)，則回退到評分
        if not top:
            results.sort(key=lambda x: x['overnight']['score'], reverse=True)
            top = [r for r in results if r['overnight']['score'] >= 50][:30]
            if not top and results:
                top = [r for r in results if r['overnight']['score'] > 0][:10]
        final_res = sanitize_data(top)
        
    set_cached_response(f"overnight_{mode}", final_res)
    return final_res

@app.get("/api/cdp-recommendations")
async def get_cdp_recommendations(force: bool = False):
    if not force:
        cached = get_cached_response("cdp")
        if cached: return cached
    
    loop = asyncio.get_event_loop()
    sids = await loop.run_in_executor(executor, lambda: fetcher.get_hot_battlefield_ids()[:40])
    await loop.run_in_executor(executor, lambda: fetcher.prefetch_data(sids))
    await loop.run_in_executor(executor, lambda: fetcher.prefetch_intraday_data(sids))
    
    def analyze_cdp_wrap(sid):
        snapshot = fetcher.get_intraday_data(sid)
        if snapshot: snapshot['stock_id'] = sid
        return analyzer.analyze(sid, intraday_snapshot=snapshot)

    tasks = []
    for sid in sids:
        tasks.append(loop.run_in_executor(executor, analyze_cdp_wrap, sid))
    
    all_res = await asyncio.gather(*tasks)
    results = [res for res in all_res if res and "error" not in res]
    
    hit_results = [r for r in results if r['cdp'].get('signals')]
    final_res = sanitize_data(hit_results if hit_results else results[:20])
    set_cached_response("cdp", final_res)
    return final_res

@app.get("/api/etf-recommendations")
async def get_etf_recommendations(force: bool = False):
    if not force:
        cached = get_cached_response("etf")
        if cached: return cached
    
    loop = asyncio.get_event_loop()
    sids = await loop.run_in_executor(executor, fetcher.get_popular_etf_ids)
    await loop.run_in_executor(executor, lambda: fetcher.prefetch_data(sids))
    
    tasks = []
    for sid in sids:
        tasks.append(loop.run_in_executor(executor, analyze_wrap, sid))
    
    all_res = await asyncio.gather(*tasks)
    results = [res for res in all_res if res and "error" not in res]
    results.sort(key=lambda x: x['etf_rec']['score'], reverse=True)
    final_res = sanitize_data(results)
    set_cached_response("etf", final_res)
    return final_res

@app.get("/api/industries")
async def get_industries():
    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(executor, fetcher.get_industry_list)

@app.get("/api/industry/{name}")
async def get_industry_stocks(name: str):
    loop = asyncio.get_event_loop()
    sids = await loop.run_in_executor(executor, fetcher.search_stocks_by_industry, name)
    
    tasks = []
    for sid in sids:
        tasks.append(loop.run_in_executor(executor, analyze_wrap, sid))
    
    all_res = await asyncio.gather(*tasks)
    return sanitize_data([res for res in all_res if res and "error" not in res])

@app.get("/api/analyze/{query}")
async def analyze_stock(query: str):
    loop = asyncio.get_event_loop()
    sid = await loop.run_in_executor(executor, fetcher.resolve_stock_id, query)
    if not sid:
        raise HTTPException(status_code=404, detail="找不到標的")
    
        
    res = await loop.run_in_executor(executor, analyze_wrap, sid)
    if "error" in res:
        raise HTTPException(status_code=400, detail=res["error"])
    return sanitize_data(res)

@app.post("/api/sync")
async def sync_data(mode: str = "1"):
    loop = asyncio.get_event_loop()
    await loop.run_in_executor(executor, lambda: fetcher.fetch_twse_openapi(fetch_all=(mode == "2")))
    return {"status": "success"}

@app.get("/{full_path:path}")
async def serve_react_app(full_path: str):
    # 如果路徑包含 api，則不處理 (交給其他 route)
    if full_path.startswith("api/"):
        raise HTTPException(status_code=404)
        
    index_path = os.path.join(frontend_path, "index.html")
    if os.path.exists(index_path):
        with open(index_path, "r", encoding="utf-8") as f:
            return HTMLResponse(content=f.read())
    return HTMLResponse(content="<h1>台股偵測系統</h1><p>請先執行 frontend 編譯 (npm run build)。</p>")

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)
