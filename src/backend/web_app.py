import uvicorn
from fastapi import FastAPI, HTTPException, Query
from fastapi.staticfiles import StaticFiles
from fastapi.responses import HTMLResponse
from typing import List, Optional
import asyncio
import time
import os
import config
from contextlib import asynccontextmanager
from concurrent.futures import ThreadPoolExecutor

from src.backend.analyzer import StockAnalyzer
from src.backend.data_fetcher import DataFetcher

# 初始化服務
config.seed_cache()
fetcher = DataFetcher()
analyzer = StockAnalyzer(fetcher=fetcher)

@asynccontextmanager
async def lifespan(app: FastAPI):
    # 啟動時執行初步數據同步 (非阻塞方式)
    if not os.environ.get("VERCEL"):
        print("[系統] 正在啟動背景數據同步...")
        asyncio.create_task(background_sync())
    yield

async def background_sync():
    try:
        loop = asyncio.get_event_loop()
        await loop.run_in_executor(None, fetcher.fetch_twse_openapi)
        print("[系統] 背景數據同步完成。")
    except Exception as e:
        print(f"[系統] 背景同步發生錯誤: {e}")

from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(title="台股偵測系統 Web 版 (Optimized)", lifespan=lifespan)

# 加入 CORS 設定，允許前端跨域存取
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], # 生產環境建議設定為您的 Vercel 網址
    allow_credentials=True,
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

@app.get("/api/status")
async def get_status():
    current_status = fetcher.get_market_status()
    if fetcher._official_cache:
        data_date = list(fetcher._official_cache.values())[0]['date']
    else:
        loop = asyncio.get_event_loop()
        sample_df = await loop.run_in_executor(None, lambda: fetcher.get_taiex_data(days=1))
        data_date = sample_df.index[-1].strftime("%Y-%m-%d") if not sample_df.empty else "確認中..."
    
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
    for title, url in tw_news_items:
        import re
        found_ids = [sid for sid in re.findall(r'\d{4}', title) if sid in valid_ids]
        tw_result.append({
            "title": title,
            "url": url,
            "related_stocks": found_ids,
            "source": "TWSE"
        })
    
    gl_result = []
    for title, url in gl_news_items:
        gl_result.append({
            "title": title,
            "url": url,
            "source": "Global"
        })
        
    return {"taiwan": tw_result, "global": gl_result}

executor = ThreadPoolExecutor(max_workers=10)

@app.get("/api/long-term-recommendations")
async def get_long_term_recommendations():
    loop = asyncio.get_event_loop()
    sids = config.LONG_TERM_STOCK_IDS
    await loop.run_in_executor(executor, lambda: fetcher.prefetch_data(sids))
    
    tasks = []
    for sid in sids:
        tasks.append(loop.run_in_executor(executor, analyzer.analyze, sid))
    
    all_res = await asyncio.gather(*tasks)
    results = [res for res in all_res if res and "error" not in res]
    # 長期股通常不特別依照短線分數排序，保持原始精選順序或依照 PE 排序
    return results

@app.get("/api/hot-stocks")
async def get_hot_stocks():
    loop = asyncio.get_event_loop()
    sids = await loop.run_in_executor(executor, lambda: fetcher.get_hot_battlefield_ids()[:50])
    await loop.run_in_executor(executor, lambda: fetcher.prefetch_data(sids))
    
    tasks = []
    for sid in sids:
        tasks.append(loop.run_in_executor(executor, analyzer.analyze, sid))
    
    results = await asyncio.gather(*tasks)
    return [res for res in results if res and "error" not in res]

@app.get("/api/short-term-recommendations")
async def get_short_term_recommendations():
    loop = asyncio.get_event_loop()
    sids = await loop.run_in_executor(executor, lambda: fetcher.get_hot_battlefield_ids()[:50])
    await loop.run_in_executor(executor, lambda: fetcher.prefetch_data(sids))
    
    tasks = []
    for sid in sids:
        tasks.append(loop.run_in_executor(executor, analyzer.analyze, sid))
    
    all_res = await asyncio.gather(*tasks)
    results = [res for res in all_res if res and "error" not in res and res['price'] <= config.MAX_STOCK_PRICE_FOR_ST_REC]
    results.sort(key=lambda x: x["short_term_rec"]["score"], reverse=True)
    return results[:10]

@app.get("/api/bottom-fishing-recommendations")
async def get_bottom_fishing_recommendations():
    loop = asyncio.get_event_loop()
    sids = await loop.run_in_executor(executor, lambda: fetcher.get_hot_battlefield_ids()[:60])
    await loop.run_in_executor(executor, lambda: fetcher.prefetch_data(sids))
    
    tasks = []
    for sid in sids:
        tasks.append(loop.run_in_executor(executor, analyzer.analyze, sid))
    
    all_res = await asyncio.gather(*tasks)
    results = [res for res in all_res if res and "error" not in res]
    results.sort(key=lambda x: x["bottom_fishing_rec"]["score"], reverse=True)
    return [r for r in results if r["bottom_fishing_rec"]["score"] >= 50][:20]

@app.get("/api/short-term-burst-recommendations")
async def get_short_term_burst_recommendations():
    loop = asyncio.get_event_loop()
    sids = await loop.run_in_executor(executor, lambda: fetcher.get_hot_battlefield_ids()[:80])
    await loop.run_in_executor(executor, lambda: fetcher.prefetch_data(sids))
    
    tasks = []
    for sid in sids:
        tasks.append(loop.run_in_executor(executor, analyzer.analyze, sid))
    
    all_res = await asyncio.gather(*tasks)
    results = [res for res in all_res if res and "error" not in res]
    results.sort(key=lambda x: x["short_term_burst_rec"]["score"], reverse=True)
    return [r for r in results if r["short_term_burst_rec"]["score"] >= 60][:20]

@app.get("/api/overnight-recommendations")
async def get_overnight_recommendations(mode: str = "1"):
    loop = asyncio.get_event_loop()
    sids = await loop.run_in_executor(executor, fetcher.get_hot_battlefield_ids)
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
        return [r for r in results if r['overnight']['score'] >= 45 and not r['is_limit_up']][:30]
    else: # 盤後籌碼
        # 優先依照 broker_ratio 排序
        results.sort(key=lambda x: x['overnight'].get('broker_ratio', 0), reverse=True)
        top = [r for r in results if r['overnight'].get('broker_ratio', 0) > 3][:30]
        
        # 如果沒數據 (受限)，則回退到評分
        if not top:
            results.sort(key=lambda x: x['overnight']['score'], reverse=True)
            top = [r for r in results if r['overnight']['score'] >= 50][:30]
        return top

@app.get("/api/cdp-recommendations")
async def get_cdp_recommendations():
    loop = asyncio.get_event_loop()
    sids = await loop.run_in_executor(executor, lambda: fetcher.get_hot_battlefield_ids()[:100])
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
    return hit_results if hit_results else results[:20]

@app.get("/api/etf-recommendations")
async def get_etf_recommendations():
    loop = asyncio.get_event_loop()
    sids = await loop.run_in_executor(executor, fetcher.get_popular_etf_ids)
    await loop.run_in_executor(executor, lambda: fetcher.prefetch_data(sids))
    
    tasks = []
    for sid in sids:
        tasks.append(loop.run_in_executor(executor, analyzer.analyze, sid))
    
    all_res = await asyncio.gather(*tasks)
    results = [res for res in all_res if res and "error" not in res]
    results.sort(key=lambda x: x['etf_rec']['score'], reverse=True)
    return results

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
        tasks.append(loop.run_in_executor(executor, analyzer.analyze, sid))
    
    all_res = await asyncio.gather(*tasks)
    return [res for res in all_res if res and "error" not in res]

@app.get("/api/analyze/{query}")
async def analyze_stock(query: str):
    loop = asyncio.get_event_loop()
    sid = await loop.run_in_executor(executor, fetcher.resolve_stock_id, query)
    if not sid:
        raise HTTPException(status_code=404, detail="找不到標的")
    
    def analyze_wrap(sid):
        snapshot = fetcher.get_intraday_data(sid)
        if snapshot: snapshot['stock_id'] = sid
        return analyzer.analyze(sid, intraday_snapshot=snapshot)
        
    res = await loop.run_in_executor(executor, analyze_wrap, sid)
    if "error" in res:
        raise HTTPException(status_code=400, detail=res["error"])
    return res

@app.post("/api/sync")
async def sync_data(mode: str = "1"):
    loop = asyncio.get_event_loop()
    await loop.run_in_executor(executor, lambda: fetcher.fetch_twse_openapi(fetch_all=(mode == "2")))
    return {"status": "success"}

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)
