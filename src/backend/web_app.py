import uvicorn
from fastapi import FastAPI, HTTPException, Query
from fastapi.staticfiles import StaticFiles
from fastapi.responses import HTMLResponse
from typing import List, Optional
import asyncio
import time
import os
import gc
import numpy as np
from src.backend import config
import asyncio
from datetime import datetime, timedelta
import pytz
from contextlib import asynccontextmanager
from concurrent.futures import ThreadPoolExecutor

from src.backend.analyzer import StockAnalyzer
from src.backend.data_fetcher import DataFetcher

import math

import pandas as pd

def sanitize_data(data):
    if isinstance(data, (pd.DataFrame, pd.Series)):
        return None # Prevent DataFrames from causing pd.isna ambiguous truth value errors
    elif isinstance(data, dict):
        return {str(k): sanitize_data(v) for k, v in data.items() if not isinstance(v, (pd.DataFrame, pd.Series))}
    elif isinstance(data, list):
        return [sanitize_data(v) for v in data]
    elif isinstance(data, tuple):
        return tuple(sanitize_data(v) for v in data)
    elif pd.isna(data):
        return None
    elif isinstance(data, (np.bool_, bool)):
        return bool(data)
    elif isinstance(data, (np.integer, int)):
        return int(data)
    elif isinstance(data, (np.floating, float)):
        val = float(data)
        if math.isnan(val) or math.isinf(val):
            return 0.0
        return val
    elif hasattr(data, 'item') and callable(data.item):
        try:
            return data.item()
        except:
            pass
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
    bg_tasks = []
    # 啟動時執行初步數據同步 (非阻塞方式)
    if not os.environ.get("VERCEL"):
        print("[系統] 正在啟動背景數據同步...")
        bg_tasks.append(asyncio.create_task(background_sync()))
        bg_tasks.append(asyncio.create_task(background_strategies_sync()))
    
    yield
    
    # 關閉時清理背景任務
    for task in bg_tasks:
        task.cancel()
    if bg_tasks:
        await asyncio.gather(*bg_tasks, return_exceptions=True)
        print("[系統] 背景同步任務已優雅關閉")

async def background_sync():
    loop = asyncio.get_event_loop()
    try:
        # 強制啟動時抓取一次台股代號列表，確保 _stock_id_map 完整，避免個股名稱顯示為「未知」
        try:
            await loop.run_in_executor(None, lambda: fetcher.fetch_twse_openapi(fetch_all=False))
        except Exception as e:
            print(f"[系統] 啟動時預載資料失敗: {e}")
            
        while True:
            try:
                await loop.run_in_executor(None, fetcher.sync_if_needed)
            except Exception as e:
                print(f"[系統] 背景同步發生錯誤: {e}")
            await asyncio.sleep(3600)
    except asyncio.CancelledError:
        pass

async def background_strategies_sync():
    # 等待初始資料同步完成
    await asyncio.sleep(15)
    
    while True:
        try:
            now = datetime.now(pytz.timezone("Asia/Taipei"))
            print(f"[系統] 定時更新機制啟動 ({now.strftime('%H:%M')})，執行 3 分鐘持續更新...")
            
            loop = asyncio.get_event_loop()
            long_term = await get_long_term_recommendations(force=True)
            hot_stocks = await get_hot_stocks(force=True)
            short_term = await get_short_term_recommendations(force=True)
            bottom_fishing = await get_bottom_fishing_recommendations(force=True)
            short_term_burst = await get_short_term_burst_recommendations(force=True)
            overnight_1 = await get_overnight_recommendations(mode="1", force=True)
            overnight_2 = await get_overnight_recommendations(mode="2", force=True)
            cdp = await get_cdp_recommendations(force=True)
            etf = await get_etf_recommendations(force=True)
            capital_flow = await get_capital_flow_recommendations(force=True)
            
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
                
                try:
                    day_trade_cdp = await get_day_trade_cdp_recommendations(force=True)
                    await loop.run_in_executor(None, update_doc, 'day_trade_cdp', day_trade_cdp)
                except Exception as e:
                    print(f"[系統] 同步 day_trade_cdp 失敗: {e}")

                await loop.run_in_executor(None, update_doc, 'etf', etf)
                await loop.run_in_executor(None, update_doc, 'capital_flow', capital_flow)
                
                try:
                    institutional_flow = await loop.run_in_executor(None, fetcher.get_institutional_flow, 30)
                    await loop.run_in_executor(None, update_doc, 'institutional_flow', institutional_flow)
                except Exception as e:
                    print(f"[系統] 同步 institutional_flow 失敗: {e}")

                print("[系統] 背景深度策略分析完成，已同步寫入 Firebase Firestore！")
            else:
                print("[系統] 背景深度策略分析完成 (已快取)，但未同步至 Firebase (無金鑰)")
                
            # 強制回收記憶體，避免大量 DataFrame 造成記憶體超過 512MB
            gc.collect()
                
            await asyncio.sleep(3600) # 休息 1 小時
                
        except asyncio.CancelledError:
            return
        except Exception as e:
            print(f"[系統] 背景策略分析與同步錯誤: {e}")
            await asyncio.sleep(3600)


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

# 設定前端靜態檔路徑
# 在 Vercel 環境中，路徑會從專案根目錄開始
current_dir = os.path.dirname(os.path.abspath(__file__))
root_dir = os.path.dirname(current_dir)
project_root = os.path.dirname(root_dir)
frontend_path = os.path.join(project_root, "dist")

if not os.environ.get("VERCEL") and os.path.exists(frontend_path):
    # Do not use StaticFiles due to anyio.NoEventLoopError bug on some environments
    # app.mount("/assets", StaticFiles(directory=os.path.join(frontend_path, "assets")), name="assets")
    pass
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

@app.get("/api/status")
async def get_status():
    cached = get_cached_response("status")
    if cached: return cached
    
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
    
    res = {
        "market_status": current_status,
        "data_date": data_date,
        "server_time": time.time()
    }
    set_cached_response("status", res, expiry=180)
    return res

@app.get("/api/global-market")
async def get_global_market():
    cached = get_cached_response("global_market")
    if cached: return cached
    loop = asyncio.get_event_loop()
    res = await loop.run_in_executor(None, fetcher.get_global_markets)
    set_cached_response("global_market", res, expiry=180)
    return res

@app.get("/api/futures")
async def get_futures():
    cached = get_cached_response("futures")
    if cached: return cached
    loop = asyncio.get_event_loop()
    # Try realtime first, fallback to FinMind daily
    result = await loop.run_in_executor(None, fetcher.get_realtime_wtx)
    if not result:
        result = await loop.run_in_executor(None, fetcher.get_taiwan_futures)
    res = result or {"price": None, "change_pct": None, "session": "N/A", "date": None}
    if res.get("price") is not None:
        set_cached_response("futures", res, expiry=60)
    return res

@app.get("/api/market-outlook")
async def get_market_outlook():
    cached = get_cached_response("market_outlook")
    if cached: return cached
    loop = asyncio.get_event_loop()
    markets = await loop.run_in_executor(None, fetcher.get_global_markets)
    futures = await loop.run_in_executor(None, fetcher.get_realtime_wtx) or await loop.run_in_executor(None, fetcher.get_taiwan_futures) or {}
    
    signals = []
    outlook_score = 0  # positive = bullish, negative = bearish
    
    # 1. US tech indices
    sox = markets.get("費半指數", {})
    nasdaq = markets.get("那斯達克", {})
    sp500 = markets.get("標普500", {})
    
    if sox.get("change_pct", 0) > 1:
        outlook_score += 2; signals.append(f"✅ 費半指數大漲 +{sox['change_pct']}%，台股半導體族群利多")
    elif sox.get("change_pct", 0) < -1:
        outlook_score -= 2; signals.append(f"⚠️ 費半指數重挫 {sox['change_pct']}%，台股有補跌壓力")
    
    if nasdaq.get("change_pct", 0) > 0.5:
        outlook_score += 1; signals.append(f"✅ 那斯達克收漲 +{nasdaq['change_pct']}%，科技股氣氛正面")
    elif nasdaq.get("change_pct", 0) < -0.5:
        outlook_score -= 1; signals.append(f"⚠️ 那斯達克下跌 {nasdaq['change_pct']}%，科技股承壓")
    
    # 2. Taiwan specific
    tsm = markets.get("台積電ADR", {})
    if tsm.get("change_pct", 0) > 1:
        outlook_score += 2; signals.append(f"✅ 台積電ADR大漲 +{tsm['change_pct']}%，權值股強勁支撐")
    elif tsm.get("change_pct", 0) < -1:
        outlook_score -= 2; signals.append(f"⚠️ 台積電ADR下跌 {tsm['change_pct']}%，權值股承壓")
    
    # 3. Currency
    twd = markets.get("美元/台幣", {})
    if twd.get("change_pct", 0) < -0.3:
        outlook_score += 1; signals.append("✅ 新台幣升值，資金流入台股")
    elif twd.get("change_pct", 0) > 0.3:
        outlook_score -= 1; signals.append("⚠️ 新台幣責值，外資有可能化汇出")
    
    # 4. Futures
    if futures.get("change_pct") is not None:
        fp = futures["change_pct"]
        if fp > 0.5:
            outlook_score += 1; signals.append(f"✅ 台指期偏多 +{fp}%，盤前氣氛正面")
        elif fp < -0.5:
            outlook_score -= 1; signals.append(f"⚠️ 台指期偏空 {fp}%，盤前氣氛謹慎")
    
    if not signals:
        signals.append("✅ 全球市場變動不大，台股可能橫盤整理")
    
    if outlook_score >= 3:
        trend = "偏多"
        trend_desc = "美股科技股強勁，台股可望開高並向上测試壓力位"
    elif outlook_score >= 1:
        trend = "微多"
        trend_desc = "國際市場氣氛偏正面，台股有機會收在紅盤"
    elif outlook_score <= -3:
        trend = "偏空"
        trend_desc = "美股科技股重挫，台股開盤有補跌風險，建議觀望"
    elif outlook_score <= -1:
        trend = "微空"
        trend_desc = "國際市場氣氛偏謹慎，台股開盤可能小跌"
    else:
        trend = "中性"
        trend_desc = "全球市場變動不大，台股可能在平盤附近整理"
    
    res = {
        "trend": trend,
        "trend_desc": trend_desc,
        "outlook_score": outlook_score,
        "signals": signals
    }
    set_cached_response("market_outlook", res, expiry=180)
    return res

@app.get("/api/news")
async def get_news():
    cached = get_cached_response("news")
    if cached: return cached
    loop = asyncio.get_event_loop()
    # 獲取台股新聞
    tw_news_items, _ = await loop.run_in_executor(None, fetcher.get_comprehensive_news)
    # 獲取全球新聞
    gl_news_items = await loop.run_in_executor(None, fetcher.get_global_news)
    
    valid_ids = list(fetcher._stock_id_map.keys()) if fetcher._stock_id_map else []
    valid_ids = set(valid_ids)
    
    tw_result = []
    for item in tw_news_items:
        import re
        found_ids = [sid for sid in re.findall(r'\d{4}', item.get("title", "")) if sid in valid_ids]
        item["related_stocks"] = found_ids
        tw_result.append(item)
    
    gl_result = gl_news_items
        
    res = {"taiwan": tw_result, "global": gl_result}
    set_cached_response("news", res, expiry=300)
    return res



executor = ThreadPoolExecutor(max_workers=3)

def analyze_wrap(sid):
    return analyzer.analyze(sid)


@app.get("/api/institutional-flow")
async def get_institutional_flow_api(force: bool = False):
    if not force:
        cached = get_cached_response("institutional_flow")
        if cached: return cached
    
    loop = asyncio.get_event_loop()
    res = await loop.run_in_executor(None, fetcher.get_institutional_flow, 30)
    final_res = sanitize_data(res)
    set_cached_response("institutional_flow", final_res)
    return final_res

@app.get("/api/long-term-recommendations")
async def get_long_term_recommendations(force: bool = False):
    if not force:
        cached = get_cached_response("long_term")
        if cached: return cached
    
    loop = asyncio.get_event_loop()
    sids = config.LONG_TERM_STOCK_IDS
    await loop.run_in_executor(executor, lambda: fetcher.prefetch_data(sids))
    await loop.run_in_executor(executor, lambda: fetcher.prefetch_intraday_data(sids))
    
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
    await loop.run_in_executor(executor, lambda: fetcher.prefetch_intraday_data(sids))
    
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
    await loop.run_in_executor(executor, lambda: fetcher.prefetch_intraday_data(sids))
    
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
    await loop.run_in_executor(executor, lambda: fetcher.prefetch_intraday_data(sids))
    
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
    await loop.run_in_executor(executor, lambda: fetcher.prefetch_intraday_data(sids))
    
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

@app.get("/api/recommendations/day-trade-cdp")
async def get_day_trade_cdp_recommendations(force: bool = False):
    if not force:
        cached = get_cached_response("day_trade_cdp")
        if cached: return cached
    
    loop = asyncio.get_event_loop()
    # 擴大範圍掃描，因為符合當沖條件的股票可能不多
    sids = await loop.run_in_executor(executor, lambda: fetcher.get_hot_battlefield_ids()[:50])
    await loop.run_in_executor(executor, lambda: fetcher.prefetch_data(sids))
    await loop.run_in_executor(executor, lambda: fetcher.prefetch_intraday_data(sids))
    
    tasks = []
    for sid in sids:
        tasks.append(loop.run_in_executor(executor, analyze_wrap, sid))
    
    all_res = await asyncio.gather(*tasks)
    results = [res for res in all_res if res and "error" not in res and "day_trade_cdp_rec" in res]
    
    # 篩出 is_valid == True 的結果
    valid_results = [r for r in results if r["day_trade_cdp_rec"].get("is_valid", False)]
    valid_results.sort(key=lambda x: x["day_trade_cdp_rec"]["score"], reverse=True)
    
    if not valid_results and results:
        # 如果沒有嚴格符合條件的，至少回傳最高分的
        results.sort(key=lambda x: x["day_trade_cdp_rec"]["score"], reverse=True)
        valid_results = [r for r in results if r["day_trade_cdp_rec"]["score"] > 0][:10]
        
    final_res = sanitize_data(valid_results[:15])
    set_cached_response("day_trade_cdp", final_res)
    return final_res

@app.get("/api/overnight-recommendations")
async def get_overnight_recommendations(mode: str = "1", force: bool = False):
    if not force:
        cached = get_cached_response(f"overnight_{mode}")
        if cached: return cached
    
    loop = asyncio.get_event_loop()
    def get_custom_overnight_ids():
        # 尋找當日極度強勢（大漲或鎖漲停）、具備極高熱度與大成交量的標的
        hot_ids = fetcher.get_hot_battlefield_ids()[:30] # 原本的熱門
        
        hold_ids = []
        if fetcher._official_cache:
            # 優先從成交量大的開始找
            sorted_cache = sorted(fetcher._official_cache.items(), key=lambda x: x[1].get('volume', 0), reverse=True)
            for sid, info in sorted_cache:
                if sid == "TAIEX" or fetcher.is_etf(sid): continue
                cp = info.get("change_pct", 0)
                price = info.get("price", 0)
                vol = info.get("volume", 0)
                # 漲幅 >= 7.5%，量能大於 3000 張 (因漲停常導致成交量縮)
                if cp >= 7.5 and price <= config.MAX_STOCK_PRICE_FOR_ST_REC and vol >= 3000:
                    hold_ids.append(sid)
        
        # 合併並去重，優先掃描極度強勢標的
        combined = list(dict.fromkeys(hold_ids + hot_ids))
        return combined[:60] # 最多分析 60 檔以控制效能
        
    sids = await loop.run_in_executor(executor, get_custom_overnight_ids)
    await loop.run_in_executor(executor, lambda: fetcher.prefetch_data(sids))
    await loop.run_in_executor(executor, lambda: fetcher.prefetch_intraday_data(sids))
    
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
        # 移除不可為漲停的限制，因為新的隔日沖策略明確追求漲停鎖死或極度強勢標的
        top = [r for r in results if r['overnight']['score'] >= 40][:30]
        if not top and results:
            top = [r for r in results if r['overnight']['score'] > 0][:10]
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
    await loop.run_in_executor(executor, lambda: fetcher.prefetch_intraday_data(sids))
    
    tasks = []
    for sid in sids:
        tasks.append(loop.run_in_executor(executor, analyze_wrap, sid))
    
    all_res = await asyncio.gather(*tasks)
    results = [res for res in all_res if res and "error" not in res]
    results.sort(key=lambda x: x['etf_rec']['score'], reverse=True)
    final_res = sanitize_data(results)
    set_cached_response("etf", final_res)
    return final_res

@app.get("/api/market-breadth")
async def get_market_breadth_api():
    loop = asyncio.get_event_loop()
    res = await loop.run_in_executor(executor, fetcher.get_market_breadth)
    return res

@app.get("/api/capital-flow")
async def get_capital_flow_recommendations(force: bool = False):
    if not force:
        cached = get_cached_response("capital_flow")
        if cached: return cached
    
    loop = asyncio.get_event_loop()
    cf_data = await loop.run_in_executor(executor, fetcher.get_capital_flow)
    final_res = sanitize_data(cf_data)
    set_cached_response("capital_flow", final_res)
    return final_res

@app.get("/api/industries")
async def get_industries():
    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(executor, fetcher.get_industry_list)

@app.get("/api/industry/{name}")
async def get_industry_stocks(name: str):
    loop = asyncio.get_event_loop()
    sids = await loop.run_in_executor(executor, fetcher.search_stocks_by_industry, name)
    await loop.run_in_executor(executor, lambda: fetcher.prefetch_data(sids))
    await loop.run_in_executor(executor, lambda: fetcher.prefetch_intraday_data(sids))
    
    tasks = []
    for sid in sids:
        tasks.append(loop.run_in_executor(executor, analyze_wrap, sid))
    
    all_res = await asyncio.gather(*tasks)
    return sanitize_data([res for res in all_res if res and "error" not in res])

@app.get("/api/resolve/{query}")
async def resolve_stock(query: str):
    loop = asyncio.get_event_loop()
    sid = await loop.run_in_executor(executor, fetcher.resolve_stock_id, query)
    if not sid:
        raise HTTPException(status_code=404, detail="找不到對應的股票代碼")
        
    sname = fetcher._stock_id_map.get(sid, "未知")
    category = "未知"
    if fetcher._stock_info_df is not None and not fetcher._stock_info_df.empty:
        try:
            row = fetcher._stock_info_df[fetcher._stock_info_df['stock_id'] == sid]
            if not row.empty:
                col = 'industry' if 'industry' in fetcher._stock_info_df.columns else 'industry_category'
                category = row.iloc[0].get(col, "未知")
        except:
            pass

    return {"stock_id": sid, "stock_name": sname, "category": category}

from pydantic import BaseModel
from typing import List, Dict, Any, Optional

class RawDataPayload(BaseModel):
    stock_id: str
    price_data: List[Dict[str, Any]]
    chip_data: List[Dict[str, Any]]
    margin_data: List[Dict[str, Any]]
    intraday: Optional[Dict[str, Any]] = None

@app.post("/api/analyze-raw")
async def analyze_raw_data(payload: RawDataPayload):
    loop = asyncio.get_event_loop()
    
    def analyze_from_raw():
        return analyzer.analyze_from_raw(
            stock_id=payload.stock_id,
            raw_price=payload.price_data,
            raw_chip=payload.chip_data,
            raw_margin=payload.margin_data,
            intraday_snapshot=payload.intraday
        )
        
    res = await loop.run_in_executor(executor, analyze_from_raw)
    if "error" in res:
        raise HTTPException(status_code=400, detail=res["error"])
    return sanitize_data(res)

@app.get("/api/analyze/{query}")
async def analyze_stock(query: str):
    loop = asyncio.get_event_loop()
    sid = await loop.run_in_executor(executor, fetcher.resolve_stock_id, query)
    if not sid:
        raise HTTPException(status_code=404, detail="找不到對應股票代碼")
    
    res = await loop.run_in_executor(executor, analyze_wrap, sid)
    if not res:
        raise HTTPException(status_code=404, detail="無法分析該股票")
    return sanitize_data(res)

@app.get("/api/finmind/{dataset}")
async def proxy_finmind(dataset: str, data_id: str, start_date: str):
    import requests
    loop = asyncio.get_event_loop()
    token = os.environ.get("FINMIND_API_TOKEN", "eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJ1c2VyX2lkIjoianVzaCIsImVtYWlsIjoiamltNjM1MjQxQGdtYWlsLmNvbSIsInRva2VuX3ZlcnNpb24iOjB9.arNTZscwqHiuFln_wO7ufKR03KQ9OQZyGk2l_pM2UN4")
    url = f"https://api.finmindtrade.com/api/v4/data?dataset={dataset}&data_id={data_id}&start_date={start_date}"
    if token:
        url += f"&token={token}"
    
    def fetch():
        res = requests.get(url, timeout=15)
        return res.json()
    
    try:
        data = await loop.run_in_executor(executor, fetch)
        return data
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/raw-data/{query}")
async def get_raw_data(query: str):
    """
    提供給前端分析器 (analyzer.js) 使用的單一 API，一次性回傳個股的所有原始資料。
    利用 Firebase 快取 FinMind 重裝資料 (避免 600次/小時 限制)，並即時拉取 Yahoo 報價。
    """
    loop = asyncio.get_event_loop()
    sid = await loop.run_in_executor(executor, fetcher.resolve_stock_id, query)
    if not sid:
        raise HTTPException(status_code=404, detail="找不到對應股票代碼")
        
    def fetch_finmind_data():
        d_chip = (datetime.now() - timedelta(days=30)).strftime("%Y-%m-%d")
        d_margin = (datetime.now() - timedelta(days=30)).strftime("%Y-%m-%d")
        d_per = (datetime.now() - timedelta(days=30)).strftime("%Y-%m-%d")
        d_news = (datetime.now() - timedelta(days=90)).strftime("%Y-%m-%d")
        d_rev = (datetime.now() - timedelta(days=365*3)).strftime("%Y-%m-%d")
        d_div = (datetime.now() - timedelta(days=365*5)).strftime("%Y-%m-%d")
        d_fin = (datetime.now() - timedelta(days=365*3)).strftime("%Y-%m-%d")
        
        def get_price():
            try:
                df = fetcher.get_price_data(sid, days=90)
                if df is not None and not df.empty:
                    df = df.reset_index()
                    if 'Date' in df.columns:
                        df['Date'] = df['Date'].dt.strftime('%Y-%m-%d')
                    elif 'index' in df.columns:
                        df['index'] = df['index'].dt.strftime('%Y-%m-%d')
                    return df.fillna(0).to_dict('records')
                return []
            except: return []

        def get_chip():
            try:
                df = fetcher.fm_loader.taiwan_stock_institutional_investors(stock_id=sid, start_date=d_chip)
                return df.fillna(0).to_dict('records') if (df is not None and not df.empty) else []
            except: return []

        def get_margin():
            try:
                df = fetcher.fm_loader.taiwan_stock_margin_purchase_short_sale(stock_id=sid, start_date=d_margin)
                return df.fillna(0).to_dict('records') if (df is not None and not df.empty) else []
            except: return []

        def get_per():
            try:
                df = fetcher.fm_loader.taiwan_stock_per_pbr(stock_id=sid, start_date=d_per)
                return df.fillna(0).to_dict('records') if (df is not None and not df.empty) else []
            except: return []

        def get_news():
            try:
                df = fetcher.fm_loader.get_data(dataset='TaiwanStockNews', data_id=sid, start_date=d_news)
                return df.fillna("").to_dict('records') if (df is not None and not df.empty) else []
            except: return []

        def get_revenue():
            try:
                df = fetcher.fm_loader.taiwan_stock_month_revenue(stock_id=sid, start_date=d_rev)
                return df.fillna(0).to_dict('records') if (df is not None and not df.empty) else []
            except: return []

        def get_dividend():
            try:
                df = fetcher.fm_loader.get_data(dataset='TaiwanStockDividendResult', data_id=sid, start_date=d_div)
                return df.fillna(0).to_dict('records') if (df is not None and not df.empty) else []
            except: return []

        def get_financials():
            try:
                df = fetcher.fm_loader.taiwan_stock_financial_statements(stock_id=sid, start_date=d_fin)
                return df.fillna(0).to_dict('records') if (df is not None and not df.empty) else []
            except: return []

        def get_shareholding():
            try:
                df = fetcher.fm_loader.taiwan_stock_shareholding(stock_id=sid, start_date=d_chip)
                return df.fillna(0).to_dict('records') if (df is not None and not df.empty) else []
            except: return []

        with ThreadPoolExecutor(max_workers=8) as ex:
            fut_price = ex.submit(get_price)
            fut_chip = ex.submit(get_chip)
            fut_margin = ex.submit(get_margin)
            fut_per = ex.submit(get_per)
            fut_news = ex.submit(get_news)
            fut_rev = ex.submit(get_revenue)
            fut_div = ex.submit(get_dividend)
            fut_fin = ex.submit(get_financials)
            fut_share = ex.submit(get_shareholding)

            price_data = fut_price.result()
            chip_data = fut_chip.result()
            margin_data = fut_margin.result()
            per_data = fut_per.result()
            news_data = fut_news.result()
            revenue_data = fut_rev.result()
            dividend_data = fut_div.result()
            financial_data = fut_fin.result()
            shareholding_data = fut_share.result()

        category = "未知"
        if fetcher._stock_info_df is not None:
            row = fetcher._stock_info_df[fetcher._stock_info_df['stock_id'] == sid]
            if not row.empty:
                col = 'industry' if 'industry' in row.columns else 'industry_category'
                category = row.iloc[0].get(col, '未知')
                
        return {
            "stock_id": sid,
            "stock_name": fetcher._stock_id_map.get(str(sid), str(sid)),
            "category": category,
            "price_data": price_data,
            "chip_data": chip_data,
            "margin_data": margin_data,
            "per_data": per_data,
            "news_data": news_data,
            "revenue_data": revenue_data,
            "dividend_data": dividend_data,
            "financial_data": financial_data,
            "shareholding_data": shareholding_data
        }

    def get_raw_data_sync():
        cached_data = None
        if firebase_db:
            try:
                doc_ref = firebase_db.collection('raw_data_cache').document(sid)
                doc = doc_ref.get()
                if doc.exists:
                    cache_content = doc.to_dict()
                    last_updated = cache_content.get('updated_at')
                    if last_updated:
                        updated_time = datetime.fromisoformat(last_updated)
                        if datetime.now(pytz.utc) - updated_time < timedelta(hours=4):
                            cached_data = cache_content.get('payload')
            except Exception as e:
                print(f"[系統] Firebase cache read error: {e}")
                
        if not cached_data:
            cached_data = fetch_finmind_data()
            if firebase_db and cached_data.get("price_data"):
                try:
                    firebase_db.collection('raw_data_cache').document(sid).set({
                        'payload': cached_data,
                        'updated_at': datetime.now(pytz.utc).isoformat()
                    })
                except Exception as e:
                    print(f"[系統] Firebase cache write error: {e}")
        
        return cached_data

    try:
        finmind_task = loop.run_in_executor(executor, get_raw_data_sync)
        
        def safe_get_intraday():
            try: return fetcher.get_intraday_data(sid)
            except Exception as e:
                print(f"Intraday fetch error: {e}")
                return {}
                
        intraday_task = loop.run_in_executor(executor, safe_get_intraday)
        
        data, intraday = await asyncio.gather(finmind_task, intraday_task)
        data["intraday"] = intraday
        return sanitize_data(data)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/sync")
async def sync_data(mode: str = "1"):
    loop = asyncio.get_event_loop()
    await loop.run_in_executor(executor, lambda: fetcher.fetch_twse_openapi(fetch_all=(mode == "2")))
    return {"status": "success"}

from pydantic import BaseModel
from typing import Dict, Any

class TwinkleCallRequest(BaseModel):
    tool_name: str
    arguments: Dict[str, Any]

@app.get("/api/twinkle/tools")
async def api_twinkle_tools():
    from src.backend.twinkle_mcp import get_twinkle_tools
    try:
        tools = await get_twinkle_tools()
        return {"tools": tools}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/twinkle/call")
async def api_twinkle_call(req: TwinkleCallRequest):
    from src.backend.twinkle_mcp import call_twinkle_tool
    try:
        result = await call_twinkle_tool(req.tool_name, req.arguments)
        return {"result": result}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/{full_path:path}")
async def serve_react_app(full_path: str):
    # 如果路徑包含 api，則不處理 (交給其他 route)
    if full_path.startswith("api/"):
        raise HTTPException(status_code=404)
        
    file_path = os.path.join(frontend_path, full_path)
    
    # If the requested file actually exists in dist, serve it directly
    if os.path.isfile(file_path):
        import mimetypes
        mime_type, _ = mimetypes.guess_type(file_path)
        with open(file_path, "rb") as f:
            from fastapi.responses import Response
            return Response(content=f.read(), media_type=mime_type or "application/octet-stream")
            
    # Otherwise, fallback to index.html for React Router
    index_path = os.path.join(frontend_path, "index.html")
    if os.path.exists(index_path):
        with open(index_path, "r", encoding="utf-8") as f:
            return HTMLResponse(content=f.read())
    return HTMLResponse(content="<h1>台股偵測系統</h1><p>請先執行 frontend 編譯 (npm run build)。</p>")

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)
