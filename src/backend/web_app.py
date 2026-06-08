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
from src.backend.company_registry import get_tax_id

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
    cf_data = await loop.run_in_executor(api_executor, fetcher.get_capital_flow)
    final_res = sanitize_data(cf_data)
    wrapper = {
        "data": final_res,
        "base_date": fetcher.get_last_expected_trading_date().strftime("%Y-%m-%d")
    }
    set_cached_response("capital_flow", wrapper)
    return wrapper

@app.get("/api/long-term-recommendations")
async def get_long_term_recommendations(force: bool = False):
    if not force:
        cached = get_cached_response("long_term")
        if cached: return cached
    
    loop = asyncio.get_event_loop()
    cf_data = await loop.run_in_executor(api_executor, fetcher.get_capital_flow)
    final_res = sanitize_data(cf_data)
    wrapper = {
        "data": final_res,
        "base_date": fetcher.get_last_expected_trading_date().strftime("%Y-%m-%d")
    }
    set_cached_response("capital_flow", wrapper)
    return wrapper

@app.get("/api/hot-stocks")
async def get_hot_stocks(force: bool = False):
    if not force:
        cached = get_cached_response("hot_stocks")
        if cached: return cached
    
    loop = asyncio.get_event_loop()
    cf_data = await loop.run_in_executor(api_executor, fetcher.get_capital_flow)
    final_res = sanitize_data(cf_data)
    wrapper = {
        "data": final_res,
        "base_date": fetcher.get_last_expected_trading_date().strftime("%Y-%m-%d")
    }
    set_cached_response("capital_flow", wrapper)
    return wrapper

@app.get("/api/short-term-recommendations")
async def get_short_term_recommendations(force: bool = False):
    if not force:
        cached = get_cached_response("short_term")
        if cached: return cached
    
    loop = asyncio.get_event_loop()
    cf_data = await loop.run_in_executor(api_executor, fetcher.get_capital_flow)
    final_res = sanitize_data(cf_data)
    wrapper = {
        "data": final_res,
        "base_date": fetcher.get_last_expected_trading_date().strftime("%Y-%m-%d")
    }
    set_cached_response("capital_flow", wrapper)
    return wrapper

@app.get("/api/bottom-fishing-recommendations")
async def get_bottom_fishing_recommendations(force: bool = False):
    if not force:
        cached = get_cached_response("bottom_fishing")
        if cached: return cached
    
    loop = asyncio.get_event_loop()
    cf_data = await loop.run_in_executor(api_executor, fetcher.get_capital_flow)
    final_res = sanitize_data(cf_data)
    wrapper = {
        "data": final_res,
        "base_date": fetcher.get_last_expected_trading_date().strftime("%Y-%m-%d")
    }
    set_cached_response("capital_flow", wrapper)
    return wrapper

@app.get("/api/short-term-burst-recommendations")
async def get_short_term_burst_recommendations(force: bool = False):
    if not force:
        cached = get_cached_response("short_term_burst")
        if cached: return cached
    
    loop = asyncio.get_event_loop()
    cf_data = await loop.run_in_executor(api_executor, fetcher.get_capital_flow)
    final_res = sanitize_data(cf_data)
    wrapper = {
        "data": final_res,
        "base_date": fetcher.get_last_expected_trading_date().strftime("%Y-%m-%d")
    }
    set_cached_response("capital_flow", wrapper)
    return wrapper

@app.get("/api/recommendations/day-trade-cdp")
async def get_day_trade_cdp_recommendations(force: bool = False):
    if not force:
        cached = get_cached_response("day_trade_cdp")
        if cached: return cached
    
    loop = asyncio.get_event_loop()
    cf_data = await loop.run_in_executor(api_executor, fetcher.get_capital_flow)
    final_res = sanitize_data(cf_data)
    wrapper = {
        "data": final_res,
        "base_date": fetcher.get_last_expected_trading_date().strftime("%Y-%m-%d")
    }
    set_cached_response("capital_flow", wrapper)
    return wrapper

@app.get("/api/overnight-recommendations")
async def get_overnight_recommendations(mode: str = "1", force: bool = False):
    if not force:
        cached = get_cached_response(f"overnight_{mode}")
        if cached: return cached
    
    loop = asyncio.get_event_loop()
    cf_data = await loop.run_in_executor(api_executor, fetcher.get_capital_flow)
    final_res = sanitize_data(cf_data)
    wrapper = {
        "data": final_res,
        "base_date": fetcher.get_last_expected_trading_date().strftime("%Y-%m-%d")
    }
    set_cached_response("capital_flow", wrapper)
    return wrapper

@app.get("/api/cdp-recommendations")
async def get_cdp_recommendations(force: bool = False):
    if not force:
        cached = get_cached_response("cdp")
        if cached: return cached
    
    loop = asyncio.get_event_loop()
    cf_data = await loop.run_in_executor(api_executor, fetcher.get_capital_flow)
    final_res = sanitize_data(cf_data)
    wrapper = {
        "data": final_res,
        "base_date": fetcher.get_last_expected_trading_date().strftime("%Y-%m-%d")
    }
    set_cached_response("capital_flow", wrapper)
    return wrapper

@app.get("/api/etf-recommendations")
async def get_etf_recommendations(force: bool = False):
    if not force:
        cached = get_cached_response("etf")
        if cached: return cached
    
    loop = asyncio.get_event_loop()
    cf_data = await loop.run_in_executor(api_executor, fetcher.get_capital_flow)
    final_res = sanitize_data(cf_data)
    wrapper = {
        "data": final_res,
        "base_date": fetcher.get_last_expected_trading_date().strftime("%Y-%m-%d")
    }
    set_cached_response("capital_flow", wrapper)
    return wrapper

@app.get("/api/market-breadth")
async def get_market_breadth_api():
    loop = asyncio.get_event_loop()
    cf_data = await loop.run_in_executor(api_executor, fetcher.get_capital_flow)
    final_res = sanitize_data(cf_data)
    wrapper = {
        "data": final_res,
        "base_date": fetcher.get_last_expected_trading_date().strftime("%Y-%m-%d")
    }
    set_cached_response("capital_flow", wrapper)
    return wrapper

@app.get("/api/industries")
async def get_industries():
    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(api_executor, fetcher.get_industry_list)

@app.get("/api/industry/{name}")
async def get_industry_stocks(name: str):
    loop = asyncio.get_event_loop()
    sids = await loop.run_in_executor(api_executor, fetcher.search_stocks_by_industry, name)
    await loop.run_in_executor(bg_executor, lambda: fetcher.prefetch_data(sids))
    await loop.run_in_executor(bg_executor, lambda: fetcher.prefetch_intraday_data(sids))
    
    tasks = []
    for sid in sids:
        tasks.append(loop.run_in_executor(bg_executor, analyze_wrap, sid))
    
    all_res = await asyncio.gather(*tasks)
    return sanitize_data([res for res in all_res if res and "error" not in res])

@app.get("/api/resolve/{query}")
async def resolve_stock(query: str):
    loop = asyncio.get_event_loop()
    sid = await loop.run_in_executor(api_executor, fetcher.resolve_stock_id, query)
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
        
    res = await loop.run_in_executor(api_executor, analyze_from_raw)
    if "error" in res:
        raise HTTPException(status_code=400, detail=res["error"])
    return sanitize_data(res)

@app.get("/api/analyze/{query}")
async def analyze_stock(query: str):
    loop = asyncio.get_event_loop()
    sid = await loop.run_in_executor(api_executor, fetcher.resolve_stock_id, query)
    if not sid:
        raise HTTPException(status_code=404, detail="找不到對應股票代碼")
    
    res = await loop.run_in_executor(api_executor, analyze_wrap, sid)
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
        data = await loop.run_in_executor(api_executor, fetch)
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
    sid = await loop.run_in_executor(api_executor, fetcher.resolve_stock_id, query)
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
                if df is not None and not df.empty:
                    # FinMind 回傳的資料是依時間從舊到新，且可能很多，我們反轉並取最新 20 筆
                    records = df.fillna("").to_dict('records')
                    records.reverse()
                    return records[:20]
                return []
            except Exception as e:
                print(f"FinMind news error: {e}")
                return []

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
        finmind_task = loop.run_in_executor(api_executor, get_raw_data_sync)
        
        def safe_get_intraday():
            try: return fetcher.get_intraday_data(sid)
            except Exception as e:
                print(f"Intraday fetch error: {e}")
                return {}
                
        intraday_task = loop.run_in_executor(api_executor, safe_get_intraday)
        
        data, intraday = await asyncio.gather(finmind_task, intraday_task)
        data["intraday"] = intraday
        return sanitize_data(data)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/sync")
async def sync_data(mode: str = "1"):
    loop = asyncio.get_event_loop()
    await loop.run_in_executor(bg_executor, lambda: fetcher.fetch_twse_openapi(fetch_all=(mode == "2")))
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

class CallToolRequest(BaseModel):
    tool_name: str
    arguments: dict

@app.post("/api/twinkle/call")
async def call_tool(req: CallToolRequest):
    try:
        from src.backend.twinkle_mcp import call_twinkle_tool
        result = await call_twinkle_tool(req.tool_name, req.arguments)
        return {"result": result}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/twinkle/company/{stock_id}")
async def get_twinkle_company(stock_id: str):
    tax_id = get_tax_id(stock_id)
    if not tax_id:
        raise HTTPException(status_code=404, detail=f"找不到代號 {stock_id} 的統一編號。可能該公司未上市或沒有對應的公開資料。")
    
    try:
        from src.backend.twinkle_mcp import call_twinkle_tool
        import json
        result = await call_twinkle_tool('twtools-lookup_company_by_tax_id', {'tax_id': tax_id})
        
        # 嘗試解析回傳的結果 (Twinkle Hub 回傳 text)
        if result and len(result) > 0 and 'text' in result[0]:
            try:
                parsed_data = json.loads(result[0]['text'])
                if parsed_data.get('found'):
                    # The company details are at the root level of parsed_data
                    return {"result": parsed_data}
                else:
                    raise HTTPException(status_code=404, detail="Twinkle Hub 無法透過此統一編號找到公司資料")
            except json.JSONDecodeError:
                pass
        
        raise HTTPException(status_code=500, detail="Twinkle Hub 回傳格式異常")
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
