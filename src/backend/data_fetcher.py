import threading
import os
import pickle
import pandas as pd
import numpy as np
import requests
import yfinance as yf
import urllib3
import pytz
import time
from FinMind.data import DataLoader
from datetime import datetime, timedelta
from concurrent.futures import ThreadPoolExecutor
from src.backend import config

from collections import OrderedDict

class LRUCache(OrderedDict):
    def __init__(self, maxsize=50, *args, **kwds):
        self.maxsize = maxsize
        super().__init__(*args, **kwds)

    def __getitem__(self, key):
        value = super().__getitem__(key)
        self.move_to_end(key)
        return value

    def __setitem__(self, key, value):
        super().__setitem__(key, value)
        if len(self) > self.maxsize:
            oldest = next(iter(self))
            del self[oldest]

# 停用 SSL 警告 (針對 verify=False)
urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

# 停用 yfinance 錯誤日誌 (避免下市股票印出一堆錯誤)
import logging
logging.getLogger('yfinance').setLevel(logging.CRITICAL)
if hasattr(yf, 'shared'):
    yf.shared._ERRORS = {}

class DataFetcher:
    def __init__(self):
        try:
            self.fm_loader = DataLoader()
        except Exception as e:
            print(f"Warning: Failed to initialize FinMind DataLoader: {e}")
            self.fm_loader = None
            
        # Check for FinMind token
        token = os.environ.get("FINMIND_API_TOKEN")
        if token and self.fm_loader:
            try:
                self.fm_loader.login_by_token(api_token=token)
                print("FinMind DataLoader logged in successfully using token.")
            except Exception as e:
                print(f"Failed to login FinMind with token: {e}")
        
        self._session = requests.Session()
        self._session.verify = False
        
        try:
            from loguru import logger
            self.logger = logger
            logger.remove()
        except: 
            self.logger = None
        
        self._stock_info_df = None
        self._stock_id_map = {} 
        self._stock_name_map = {} 
        
        self._official_cache = {} 
        self._taiex_cache = None 
        self._revenue_cache = LRUCache(maxsize=50) 
        self._history_cache = LRUCache(maxsize=50)
        self._history_cache_ts = {}
        self._chip_cache = LRUCache(maxsize=50)
        self._broker_cache = LRUCache(maxsize=50)
        self._intraday_cache = LRUCache(maxsize=50) 
        self._hot_ids_cache = None 
        self._last_sync_time = 0 # 紀錄最後同步時間 (timestamp)
        self._lock = threading.RLock()
        
        if not os.path.exists(config.CACHE_DIR):
            os.makedirs(config.CACHE_DIR)
        
        self._load_local_stock_info()
        self._load_persistent_caches()


    def _load_persistent_caches(self):
        """從硬碟載入快取"""
        for cache_name in ["history", "chip", "revenue", "official"]:
            path = os.path.join(config.CACHE_DIR, f"{cache_name}_cache.pkl")
            if os.path.exists(path):
                try:
                    with open(path, "rb") as f:
                        data = pickle.load(f)
                        if cache_name == "history": 
                            self._history_cache.update(data)
                        elif cache_name == "chip": 
                            self._chip_cache.update(data)
                        elif cache_name == "revenue": 
                            self._revenue_cache.update(data)
                        elif cache_name == "official": 
                            self._official_cache = data
                            # 如果有舊數據，將最後同步時間設為檔案修改時間
                            self._last_sync_time = os.path.getmtime(path)
                except: pass

    def _save_persistent_cache(self, cache_name):
        """將快取存入硬碟"""
        path = os.path.join(config.CACHE_DIR, f"{cache_name}_cache.pkl")
        try:
            with open(path, "wb") as f:
                if cache_name == "history": data = self._history_cache
                elif cache_name == "chip": data = self._chip_cache
                elif cache_name == "revenue": data = self._revenue_cache
                elif cache_name == "official": 
                    data = self._official_cache
                    self._last_sync_time = datetime.now().timestamp()
                else: return
                pickle.dump(data, f)
        except: pass

    def _get_fm_cache(self, dataset, kwargs_key):
        cache_key = f"{dataset}_{kwargs_key}_{datetime.now().strftime('%Y-%m-%d')}"
        if cache_key in self._history_cache:
            return self._history_cache[cache_key]
        return None

    def _set_fm_cache(self, dataset, kwargs_key, data):
        cache_key = f"{dataset}_{kwargs_key}_{datetime.now().strftime('%Y-%m-%d')}"
        self._history_cache[cache_key] = data

    def get_finmind_dataset(self, dataset, **kwargs):
        """Generic method to fetch and cache any FinMind dataset, with retry on rate limit."""
        if not self.fm_loader:
            return None

        kwargs_key = str(kwargs)
        cached = self._get_fm_cache(dataset, kwargs_key)
        if cached is not None:
            return cached

        # Honour a global rate-limit back-off imposed by a previous failed call
        backoff_until = getattr(self, '_fm_backoff_until', 0)
        if time.time() < backoff_until:
            if self.logger: self.logger.warning(f"FinMind back-off active, skipping {dataset}")
            return None

        for attempt in range(3):
            try:
                df = self.fm_loader.get_data(dataset=dataset, **kwargs)  # no lock – network I/O
                if df is not None and not df.empty:
                    data = df.to_dict('records')
                    with self._lock:
                        self._set_fm_cache(dataset, kwargs_key, data)
                    return data
                break  # empty result, no point retrying
            except Exception as e:
                msg = str(e)
                if '超過使用次數' in msg or 'rate' in msg.lower():
                    wait = 2 ** attempt  # 1 s, 2 s, 4 s
                    self._fm_backoff_until = time.time() + 60  # global 60-s cool-down
                    if self.logger: self.logger.warning(f"FinMind rate limited on {dataset}, retry in {wait}s")
                    time.sleep(wait)
                else:
                    if self.logger: self.logger.warning(f"FinMind {dataset} fetch failed: {e}")
                    break
        return None
        
    def _load_local_stock_info(self):
        cache_path = os.path.join(config.CACHE_DIR, "stock_info.pkl")
        if os.path.exists(cache_path):
            try:
                with open(cache_path, "rb") as f:
                    self._stock_info_df = pickle.load(f)
            except Exception as e:
                if self.logger: self.logger.error(f"Error loading local stock info: {e}")
        self._build_id_maps()

    def _save_local_stock_info(self):
        if self._stock_info_df is not None and not self._stock_info_df.empty:
            cache_path = os.path.join(config.CACHE_DIR, "stock_info.pkl")
            try:
                with open(cache_path, "wb") as f:
                    pickle.dump(self._stock_info_df, f)
            except Exception as e:
                if self.logger: self.logger.error(f"Error saving local stock info: {e}")

    def _build_id_maps(self):
        # 建立本機強健備用對照表，避免 Render 伺服器因無法反序列化或 API 被擋導致名稱缺失
        try:
            from src.backend.stock_map import STOCK_MAP
            for sid, name in STOCK_MAP.items():
                self._stock_id_map[sid] = name
                self._stock_name_map[name] = sid
        except ImportError:
            pass

        if self._stock_info_df is not None and not self._stock_info_df.empty:
            for _, row in self._stock_info_df.iterrows():
                sid = str(row['stock_id'])
                name = str(row['stock_name'])
                self._stock_id_map[sid] = name
                self._stock_name_map[name] = sid

    def get_financial_statements(self, stock_id: str):
        """獲取資產負債表與損益表核心指標 (ROE, 負債比, 毛利, 營益)"""
        with self._lock:
            if stock_id in self._official_cache and 'roe' in self._official_cache[stock_id]:
                return self._official_cache[stock_id]
        try:
            start = (datetime.now() - timedelta(days=500)).strftime("%Y-%m-%d")
            # 獲取綜合損益表
            df_is = self.fm_loader.taiwan_stock_financial_statements(stock_id=stock_id, start_date=start)
            # 獲取資產負債表
            df_bs = self.fm_loader.get_data(dataset="TaiwanStockFinancialStatements", stock_id=stock_id, start_date=start)
            
            if df_is is not None and not df_is.empty:
                # 簡單過濾最新一季數據
                df_is = df_is.sort_values('date', ascending=False)
                latest_date = df_is['date'].iloc[0]
                latest_data = df_is[df_is['date'] == latest_date]
                
                def get_val(name):
                    v = latest_data[latest_data['type'] == name]['value']
                    return float(v.iloc[0]) if not v.empty else 0

                gross_margin = get_val('GrossProfitMargin') 
                operating_margin = get_val('OperatingProfitMargin')
                net_margin = get_val('NetProfitMargin')
                eps = get_val('EPS')
                
                # 計算 ROE (簡化版：本期淨利 / 權益總額)
                # 這裡需要 BS 數據，如果 FM SDK 直接提供更好，否則從 IS/BS 拼湊
                roe = get_val('ReturnOnEquity') if 'ReturnOnEquity' in latest_data['type'].values else 0
                debt_ratio = get_val('DebtRatio') if 'DebtRatio' in latest_data['type'].values else 0

                res = {
                    "fs_date": latest_date,
                    "gross_margin": round(gross_margin, 2),
                    "operating_margin": round(operating_margin, 2),
                    "net_margin": round(net_margin, 2),
                    "eps": round(eps, 2),
                    "roe": round(roe, 2),
                    "debt_ratio": round(debt_ratio, 2)
                }
                with self._lock:
                    if stock_id in self._official_cache:
                        self._official_cache[stock_id].update(res)
                    else:
                        self._official_cache[stock_id] = res
                return res
        except: pass
        return None

    def get_margin_data(self, stock_id: str, days: int = 10):
        """獲取融資融券變化"""
        try:
            start = (datetime.now() - timedelta(days=30)).strftime("%Y-%m-%d")
            df = self.fm_loader.taiwan_stock_margin_purchase_short_sale(stock_id=stock_id, start_date=start)
            if df is not None and not df.empty:
                df = df.sort_values('date')
                return df.tail(days)
        except: pass
        return pd.DataFrame()

    def get_stock_volatility(self, stock_id: str, window: int = 20):
        """計算 ATR 與 歷史波動率 (Beta 概念代用)"""
        df = self.get_price_data(stock_id, days=window + 5)
        if df.empty or len(df) < window: return {"atr": 0, "volatility": 0}
        
        # ATR 計算
        high = df['High']; low = df['Low']; close_prev = df['Close'].shift(1)
        tr = pd.concat([high - low, abs(high - close_prev), abs(low - close_prev)], axis=1).max(axis=1)
        atr = tr.rolling(window=window).mean().iloc[-1]
        
        # 波動率 (標準差 % )
        returns = df['Close'].pct_change()
        vol = returns.std() * np.sqrt(252) * 100 # 年化波動率
        
        return {"atr": round(atr, 2), "volatility": round(vol, 2)}

    def get_last_expected_trading_date(self):
        """根據目前時間，計算最後一個應該擁有的交易日期"""
        now = datetime.now(pytz.timezone("Asia/Taipei"))
        target = now
        # 09:00 前視為尚未開盤，基準日至少得是昨天
        if now.hour < 9:
            target = target - timedelta(days=1)
            
        # 往前尋找最近的交易日 (排除週末與假日)
        while target.weekday() >= 5 or target.strftime("%Y-%m-%d") in config.TW_HOLIDAYS_2026:
            target = target - timedelta(days=1)
            
        return target.date()

    def prefetch_data(self, sids, fetch_chip=True, fetch_revenue=False, fetch_broker=False, fetch_fs=True):
        if not sids: return
        
        expected_date = self.get_last_expected_trading_date()
        
        # 排除已存在且新鮮的快取
        needed_sids = []
        with self._lock:
            for sid in sids:
                is_stale = True
                if sid in self._history_cache:
                    df = self._history_cache[sid]
                    last_fetch_time = self._history_cache_ts.get(sid, 0)
                    if not df.empty:
                        last_cache_date = df.index[-1].date()
                        # 如果已有今日資料，或者在 4 小時內已經抓取過，就不視為過期，避免盤中一直重複抓取 yfinance
                        if last_cache_date >= expected_date or (time.time() - last_fetch_time < config.HISTORY_CACHE_EXPIRY):
                            is_stale = False
                
                if is_stale:
                    needed_sids.append(sid)
        
        if not needed_sids:
            print(f"[系統] {len(sids)} 檔標的之價格數據已是最新 ({expected_date})。")
        else:
            print(f"\n[系統] 偵測到數據過期或缺失，正在同步 {len(needed_sids)} 檔標的至 {expected_date}...")
            sym_map = self.get_symbol_map()
            tickers = [sym_map.get(sid, f"{sid}.TW") for sid in needed_sids]
            try:
                batch_size = 50
                for i in range(0, len(tickers), batch_size):
                    batch = tickers[i:i+batch_size]
                    current_batch_sids = needed_sids[i:i+batch_size]
                    data = yf.download(batch, period="2y", interval="1d", group_by='ticker', threads=True, progress=False, auto_adjust=False)
                    for sid in current_batch_sids:
                        ticker = sym_map.get(sid, f"{sid}.TW")
                        try:
                            if isinstance(data.columns, pd.MultiIndex):
                                if ticker not in data.columns.levels[0]: continue
                                df = data[ticker].dropna(subset=['Close'])
                            else:
                                if len(batch) == 1: df = data.dropna(subset=['Close'])
                                else: continue
                            
                            if not df.empty:
                                # 確保價格精確度
                                for col in ['Open', 'High', 'Low', 'Close']:
                                    df[col] = df[col].round(2)
                                
                                df = df.reset_index()
                                df = df.rename(columns={"Date": "Date", "Open": "Open", "High": "High", "Low": "Low", "Close": "Close", "Volume": "Volume"})
                                df['Date'] = pd.to_datetime(df['Date']).dt.tz_localize(None)
                                df = df[["Date", "Open", "High", "Low", "Close", "Volume"]].set_index('Date')
                                with self._lock:
                                    self._history_cache[sid] = df
                                    self._history_cache_ts[sid] = time.time()
                        except: continue
                self._save_persistent_cache("history")
            except Exception as e:
                if self.logger: self.logger.error(f"Prefetch yfinance error: {e}")

        # 2. 並行下載 FinMind 數據
        def fetch_fm_individual(sid):
            if fetch_chip: self.get_chip_data(sid)
            if fetch_revenue: self.get_monthly_revenue(sid)
            if fetch_broker: self.get_broker_trades(sid)
            if fetch_fs: self.get_financial_statements(sid)

        print(f"[系統] 正在同步 {len(sids)} 檔標的之籌碼與財務數據...")
        with ThreadPoolExecutor(max_workers=3) as executor:
            executor.map(fetch_fm_individual, sids)
        
        self._save_persistent_cache("chip")
        self._save_persistent_cache("official")
        print(f"[系統] 數據預先同步完成。")

    def get_symbol_map(self):
        if self._stock_info_df is None: self.get_all_stock_ids()
        df = self._stock_info_df
        if df is None or df.empty: return {}
        s_map = {}
        for _, row in df.iterrows():
            sid = str(row['stock_id'])
            # 優先檢查是否有明確的 type 標記
            market_type = str(row.get('type', '')).lower()
            if market_type in ['tpex', 'otc']:
                suffix = ".TWO"
            elif market_type in ['twse', 'tse']:
                suffix = ".TW"
            else:
                # 根據代碼範圍判斷 (備援邏輯)
                if len(sid) == 4 and sid[0] in ['3', '4', '5', '6', '8']:
                    suffix = ".TWO"
                else:
                    suffix = ".TW"
            s_map[sid] = f"{sid}{suffix}"
        return s_map

    def fetch_twse_openapi(self, fetch_all=False):
        print(f"\n[系統] 正在同步行情與財務估值數據 (OpenAPI 模式)...")
        # self._official_cache.clear() # 不要完全清除，改用更新的方式
        self._taiex_cache = None
        self._hot_ids_cache = None
        
        # 定期清空歷史相關快取，強制重新抓取確保資料推進
        # 為了避免被 Yahoo Finance rate limit，只有在換日時才清空這些大型快取
        now_date_str = datetime.now(pytz.timezone("Asia/Taipei")).strftime("%Y-%m-%d")
        with self._lock:
            if not hasattr(self, '_last_clear_date') or self._last_clear_date != now_date_str:
                self._history_cache.clear()
                self._chip_cache.clear()
                self._revenue_cache.clear()
                self._last_clear_date = now_date_str
        
        # 1. 獲取大盤指數 (yfinance)
        try:
            t = yf.Ticker("^TWII")
            hist = t.history(period="5d", auto_adjust=False)
            if not hist.empty:
                hist = hist.dropna(subset=['Close'])
                if not hist.empty:
                    last_row = hist.iloc[-1]
                    prev_row = hist.iloc[-2] if len(hist) >= 2 else last_row
                    change_pct = round(((last_row['Close'] - prev_row['Close']) / prev_row['Close']) * 100, 2)
                    self._official_cache["TAIEX"] = {
                        "date": last_row.name.strftime("%Y-%m-%d"), 
                        "price": round(last_row['Close'], 2), 
                        "change_pct": change_pct
                    }
        except: pass

        # 2. 獲取估值數據 (TWSE + TPEx)
        valuation_map = {}
        # TWSE
        try:
            v_res = self._session.get(config.TWSE_VALUATION_URL, timeout=10)
            if v_res.status_code == 200:
                data = v_res.json()
                items = data.get('value', data) if isinstance(data, dict) else data
                for item in items:
                    valuation_map[item['Code']] = {
                        "pe": item.get('P/ERatio', config.PE_RATIO_DEFAULT), 
                        "yield": item.get('DividendYield', config.YIELD_DEFAULT)
                    }
        except: pass
        # TPEx
        try:
            v_res = self._session.get(config.TPEX_VALUATION_URL, timeout=10)
            if v_res.status_code == 200:
                data = v_res.json()
                items = data.get('value', data) if isinstance(data, dict) else data
                for item in items:
                    sid = item.get('SecuritiesCompanyCode')
                    if sid:
                        valuation_map[sid] = {
                            "pe": item.get('PriceEarningRatio', config.PE_RATIO_DEFAULT), 
                            "yield": item.get('YieldRatio', config.YIELD_DEFAULT)
                        }
        except: pass

        # 3. 獲取當日行情數據 (TWSE + TPEx)
        # TWSE
        try:
            res = self._session.get(config.TWSE_DAY_ALL_URL, timeout=15)
            if res.status_code == 200:
                data = res.json()
                items = data.get('value', data) if isinstance(data, dict) else data
                for item in items:
                    sid = item['Code']
                    close = pd.to_numeric(item['ClosingPrice'].replace(',', ''), errors='coerce')
                    change = pd.to_numeric(item['Change'].replace(',', ''), errors='coerce')
                    if pd.isna(close) or pd.isna(change): continue
                    
                    prev_close = close - change
                    cpct = round((change / prev_close) * 100, 2) if prev_close != 0 else 0
                    
                    # 轉換民國日期為西元日期 (e.g. 1150508 -> 2026-05-08)
                    date_str = item['Date']
                    if len(date_str) == 7:
                        y, m, d = int(date_str[:3]) + 1911, date_str[3:5], date_str[5:]
                        date_str = f"{y}-{m}-{d}"

                    val = valuation_map.get(sid, {"pe": config.PE_RATIO_DEFAULT, "yield": config.YIELD_DEFAULT})
                    name = item.get('Name', str(sid)).strip()
                    self._stock_id_map[str(sid)] = name
                    self._stock_name_map[name] = str(sid)
                    self._official_cache[sid] = {
                        "date": date_str, "name": name, 
                        "open": pd.to_numeric(item['OpeningPrice'].replace(',', ''), errors='coerce'),
                        "high": pd.to_numeric(item['HighestPrice'].replace(',', ''), errors='coerce'),
                        "low": pd.to_numeric(item['LowestPrice'].replace(',', ''), errors='coerce'),
                        "price": close, "volume": int(pd.to_numeric(item['TradeVolume'].replace(',', ''), errors='coerce') / 1000), # 股轉張
                        "change_pct": cpct, "pe": val["pe"], "yield": val["yield"]
                    }
        except: pass

        # TPEx
        try:
            res = self._session.get(config.TPEX_DAY_ALL_URL, timeout=15)
            if res.status_code == 200:
                data = res.json()
                items = data.get('value', data) if isinstance(data, dict) else data
                for item in items:
                    sid = item['SecuritiesCompanyCode']
                    
                    def clean_val(v):
                        if isinstance(v, str): return v.strip().replace(',', '')
                        return v

                    close = pd.to_numeric(clean_val(item.get('Close')), errors='coerce')
                    change = pd.to_numeric(clean_val(item.get('Change')), errors='coerce')
                    if pd.isna(close) or pd.isna(change): continue
                    
                    prev_close = close - change
                    cpct = round((change / prev_close) * 100, 2) if prev_close != 0 else 0
                    
                    # 轉換民國日期
                    date_str = item.get('Date', "")
                    if len(date_str) == 7:
                        y, m, d = int(date_str[:3]) + 1911, date_str[3:5], date_str[5:]
                        date_str = f"{y}-{m}-{d}"

                    val = valuation_map.get(sid, {"pe": config.PE_RATIO_DEFAULT, "yield": config.YIELD_DEFAULT})
                    name = str(item.get('CompanyName', item.get('Name', sid))).strip()
                    self._stock_id_map[str(sid)] = name
                    self._stock_name_map[name] = str(sid)
                    self._official_cache[sid] = {
                        "date": date_str, "name": name, 
                        "open": pd.to_numeric(clean_val(item.get('Open')), errors='coerce'),
                        "high": pd.to_numeric(clean_val(item.get('High')), errors='coerce'),
                        "low": pd.to_numeric(clean_val(item.get('Low')), errors='coerce'),
                        "price": close, "volume": int(pd.to_numeric(clean_val(item.get('TradingShares', '0')), errors='coerce') / 1000),
                        "change_pct": cpct, "pe": val["pe"], "yield": val["yield"]
                    }
        except: pass

        self._save_persistent_cache("official")
        print(f"[系統] 數據同步完成 ({len(self._official_cache)} 檔)。")

    def get_day_trading_data(self, stock_id: str, days: int = 5):
        try:
            start = (datetime.now() - timedelta(days=30)).strftime("%Y-%m-%d")
            df = self.fm_loader.taiwan_stock_day_trading(stock_id=stock_id, start_date=start, end_date=datetime.now().strftime("%Y-%m-%d"))
            if not df.empty: return df.tail(days)
        except: pass
        return pd.DataFrame()

    def get_intraday_data(self, stock_id: str):
        with self._lock:
            if stock_id in self._intraday_cache:
                cache_time, data = self._intraday_cache[stock_id]
                # 使用帶時區的比較
                if (datetime.now(pytz.timezone("Asia/Taipei")) - cache_time.astimezone(pytz.timezone("Asia/Taipei"))).seconds < config.INTRADAY_CACHE_EXPIRY:
                    return data
        
        try:
            sym_map = self.get_symbol_map(); symbol = sym_map.get(stock_id, f"{stock_id}.TW")
            t = yf.Ticker(symbol)
            # 獲取分K數據
            df = t.history(period="5d", interval="1m", auto_adjust=False)
            if df.empty: return None
            df.index = df.index.tz_convert("Asia/Taipei")
            # 確保價格精確度
            for col in ['Open', 'High', 'Low', 'Close']:
                df[col] = df[col].round(2)
            
            all_dates = sorted(df.index.normalize().unique())
            now = datetime.now(pytz.timezone("Asia/Taipei"))
            market_close = now.replace(hour=13, minute=31, second=0, microsecond=0)
            
            expected_date = self.get_last_expected_trading_date()
            expected_date_str = expected_date.strftime("%Y-%m-%d")
            
            # 判斷時間區間
            is_early_morning = now.hour < 9
            is_weekend = now.weekday() >= 5
            is_market_hours = (not is_weekend) and (not is_early_morning) and (now < market_close)
            
            expected_date_ts = pd.Timestamp(expected_date, tz="Asia/Taipei")
            
            if expected_date_ts in all_dates:
                price_df = df[df.index.normalize() == expected_date_ts]
            else:
                price_df = df[df.index.normalize() == all_dates[-1]]
                
            is_last_data_today = (price_df.index[-1].date() == now.date())
            is_during_market = is_market_hours and is_last_data_today
            
            # 核心邏輯：如何取得「最即時/正確」的現價
            last_price = float(price_df['Close'].iloc[-1])
            
            try:
                fast_price = t.fast_info.last_price
                if fast_price and not pd.isna(fast_price):
                    last_price = round(float(fast_price), 2)
            except:
                try:
                    fast_price = t.info.get('regularMarketPrice')
                    if fast_price and not pd.isna(fast_price):
                        last_price = round(float(fast_price), 2)
                except: pass

            official_data = self._official_cache.get(stock_id)
            if not is_market_hours:
                # 非盤中，確保收盤價精準
                if official_data and official_data.get('date') == expected_date_str:
                    if not pd.isna(official_data.get('price')):
                        last_price = float(official_data['price'])
                else:
                    try:
                        day_df = t.history(period="5d", interval="1d", auto_adjust=False)
                        day_df.index = day_df.index.tz_convert("Asia/Taipei")
                        if expected_date_ts in day_df.index:
                            cp = day_df.loc[expected_date_ts, 'Close']
                            if not pd.isna(cp):
                                last_price = round(float(cp), 2)
                    except: pass
            else:
                # 盤中，如果官方快取提早更新為今日
                if official_data and official_data.get('date') == now.strftime("%Y-%m-%d"):
                    if not pd.isna(official_data.get('price')):
                        last_price = float(official_data['price'])

            if is_during_market:
                ref_for_cdp = df[df.index.normalize() == all_dates[-2]] if len(all_dates) >= 2 else price_df
            else:
                ref_for_cdp = price_df

            # 決定 CDP 基準資料
            ref_date_str = ref_for_cdp.index[-1].strftime("%Y-%m-%d")
            
            # CDP 基準優先從歷史數據抓取 (確保 H, L, C 準確)
            if official_data and official_data.get('date') == ref_date_str:
                yesterday_high = float(official_data['high'])
                yesterday_low = float(official_data['low'])
                yesterday_close = float(official_data['price'])
            else:
                yesterday_high = float(ref_for_cdp['High'].max())
                yesterday_low = float(ref_for_cdp['Low'].min())
                yesterday_close = float(ref_for_cdp['Close'].iloc[-1])

            # 計算均價
            try:
                yesterday_avg = (ref_for_cdp['Close'] * ref_for_cdp['Volume']).sum() / (ref_for_cdp['Volume'].sum() + 1e-9)
            except:
                yesterday_avg = (yesterday_high + yesterday_low + yesterday_close) / 3

            cdp_base_date = ref_date_str
            
            price_1325_df = price_df.between_time("13:24", "13:25")
            price_1325 = float(price_1325_df['Close'].iloc[-1]) if not price_1325_df.empty else last_price
            
            # 計算今日總成交量 (股)
            daily_volume = int(price_df['Volume'].sum())
            
            # 計算流通市值與發行股數
            market_cap = 0
            shares = 0
            try:
                if hasattr(t.fast_info, 'market_cap') and t.fast_info.market_cap:
                    market_cap = float(t.fast_info.market_cap)
                if hasattr(t.fast_info, 'shares') and t.fast_info.shares:
                    shares = float(t.fast_info.shares)
            except: pass
            
            # 計算今日分時均價 (today_avg)
            try:
                today_avg = (price_df['Close'] * price_df['Volume']).sum() / (price_df['Volume'].sum() + 1e-9)
            except:
                today_avg = last_price
            
            res = {
                "stock_id": stock_id, "price": last_price, 
                "date": price_df.index[-1].strftime('%Y-%m-%d'),
                "open": float(price_df['Open'].iloc[0]),
                "high": float(price_df['High'].max()), "low": float(price_df['Low'].min()),
                "volume": daily_volume,
                "market_cap": market_cap, "shares": shares, "today_avg": round(today_avg, 2),
                "yesterday_high": yesterday_high, "yesterday_low": yesterday_low, "yesterday_close": yesterday_close, 
                "yesterday_avg": round(yesterday_avg, 2),
                "cdp_base_date": cdp_base_date,
                "price_1325": price_1325,
                "max_vol_after_1300": int(price_df.between_time("13:00", "13:30")['Volume'].max()) if not price_df.between_time("13:00", "13:30").empty else 0,
                "auction_jump": round(((last_price - price_1325) / price_1325) * 100, 2) if price_1325 > 0 else 0,
                "df_1m": price_df.copy(), "df_5m": price_df['Close'].resample('5min').ohlc()
            }
            with self._lock: self._intraday_cache[stock_id] = (datetime.now(pytz.timezone("Asia/Taipei")), res)
            return res
        except Exception as e:
            if self.logger: self.logger.error(f"Intraday fetch error for {stock_id}: {e}")
            with self._lock: self._intraday_cache[stock_id] = (datetime.now(pytz.timezone("Asia/Taipei")), None)
        return None

    def get_price_data(self, stock_id: str, days: int = 60):
        expected_date = self.get_last_expected_trading_date()
        
        with self._lock:
            if stock_id in self._history_cache:
                df = self._history_cache[stock_id]
                last_fetch_time = self._history_cache_ts.get(stock_id, 0)
                if not df.empty and (df.index[-1].date() >= expected_date or time.time() - last_fetch_time < config.HISTORY_CACHE_EXPIRY):
                    if len(df) >= days or len(df) >= 200: # If we have enough days, or we already fetched a large chunk
                        return df.tail(days)
        
        try:
            if stock_id == "TAIEX":
                t = yf.Ticker("^TWII")
                df = t.history(period="1y", interval="1d", auto_adjust=False)
                if df is not None and not df.empty:
                    for col in ['Open', 'High', 'Low', 'Close']: df[col] = df[col].round(2)
                    df = df.dropna(subset=['Close']).reset_index()
                    df = df.rename(columns={"Date": "Date"})
                    df['Date'] = pd.to_datetime(df['Date']).dt.tz_localize(None)
                    df = df[["Date", "Open", "High", "Low", "Close", "Volume"]].set_index('Date')
            else:
                is_us_stock = stock_id.isalpha() and stock_id.isascii()
                df = None
                
                if is_us_stock:
                    # 美股先抓 yfinance
                    try:
                        import yfinance as yf
                        t = yf.Ticker(stock_id)
                        yf_df = t.history(period="1y", interval="1d", auto_adjust=False)
                        if yf_df is not None and not yf_df.empty:
                            for col in ['Open', 'High', 'Low', 'Close']: yf_df[col] = yf_df[col].round(2)
                            yf_df = yf_df.dropna(subset=['Close']).reset_index()
                            yf_df = yf_df.rename(columns={"Date": "Date"})
                            yf_df['Date'] = pd.to_datetime(yf_df['Date']).dt.tz_localize(None)
                            df = yf_df[["Date", "Open", "High", "Low", "Close", "Volume"]].set_index('Date')
                    except Exception as e:
                        if self.logger: self.logger.warning(f"yfinance failed for US stock {stock_id}: {e}")
                    
                    # 如果 yfinance 抓不到或數據舊，可以嘗試 FinMind USStockPrice
                    if df is None or df.empty:
                        start = (datetime.now() - timedelta(days=days * 2 + 10)).strftime("%Y-%m-%d")
                        try:
                            fm_df = self.fm_loader.get_data(dataset='USStockPrice', data_id=stock_id, start_date=start)
                            if fm_df is not None and not fm_df.empty:
                                fm_df = fm_df.rename(columns={'date': 'Date', 'open': 'Open', 'max': 'High', 'min': 'Low', 'close': 'Close', 'Trading_Volume': 'Volume'})
                                for col in ['Open', 'High', 'Low', 'Close']:
                                    fm_df[col] = pd.to_numeric(fm_df[col], errors='coerce').round(2)
                                fm_df['Volume'] = pd.to_numeric(fm_df['Volume'], errors='coerce')
                                fm_df = fm_df.dropna(subset=['Close'])
                                fm_df['Date'] = pd.to_datetime(fm_df['Date']).dt.tz_localize(None)
                                df = fm_df[["Date", "Open", "High", "Low", "Close", "Volume"]].set_index('Date')
                        except Exception as e:
                            if self.logger: self.logger.warning(f"FinMind USStockPrice failed for {stock_id}: {e}")
                            
                else:
                    # 台股優先抓 FinMind
                    start = (datetime.now() - timedelta(days=days * 2 + 10)).strftime("%Y-%m-%d")
                    try:
                        df = self.fm_loader.taiwan_stock_daily(stock_id=stock_id, start_date=start)
                    except Exception as fm_err:
                        if self.logger: self.logger.warning(f"FinMind fetch failed for {stock_id}, falling back to yfinance: {fm_err}")
                    
                    if df is not None and not df.empty:
                        df = df.rename(columns={'date': 'Date', 'open': 'Open', 'max': 'High', 'min': 'Low', 'close': 'Close', 'Trading_Volume': 'Volume'})
                        for col in ['Open', 'High', 'Low', 'Close']:
                            df[col] = pd.to_numeric(df[col], errors='coerce').round(2)
                        df['Volume'] = pd.to_numeric(df['Volume'], errors='coerce')
                        df = df.dropna(subset=['Close'])
                        df['Date'] = pd.to_datetime(df['Date']).dt.tz_localize(None)
                        df = df[["Date", "Open", "High", "Low", "Close", "Volume"]].set_index('Date')
                    else:
                        symbols = []
                        sym_map_val = self.get_symbol_map().get(stock_id)
                        if sym_map_val: symbols.append(sym_map_val)
                        symbols.append(stock_id) # 允許直接傳入字串
                        symbols.extend([f"{stock_id}.TW", f"{stock_id}.TWO"])
                        for sym in symbols:
                            try:
                                import yfinance as yf
                                t = yf.Ticker(sym)
                                yf_df = t.history(period="1y", interval="1d", auto_adjust=False)
                                if yf_df is not None and not yf_df.empty:
                                    for col in ['Open', 'High', 'Low', 'Close']: yf_df[col] = yf_df[col].round(2)
                                    yf_df = yf_df.dropna(subset=['Close']).reset_index()
                                    yf_df = yf_df.rename(columns={"Date": "Date"})
                                    yf_df['Date'] = pd.to_datetime(yf_df['Date']).dt.tz_localize(None)
                                    df = yf_df[["Date", "Open", "High", "Low", "Close", "Volume"]].set_index('Date')
                                    break
                            except:
                                pass

            if df is None or df.empty:
                with self._lock:
                    if stock_id in self._history_cache: return self._history_cache[stock_id].tail(days)
                return pd.DataFrame()
            
            with self._lock: 
                self._history_cache[stock_id] = df
                self._history_cache_ts[stock_id] = time.time()
            return df.tail(days).ffill()
        except Exception as e:
            with self._lock:
                self._history_cache_ts[stock_id] = time.time() # 記錄失敗時間，5分鐘內不重試
            if self.logger: self.logger.error(f"Price data fetch error for {stock_id}: {e}")
            with self._lock:
                if stock_id in self._history_cache: return self._history_cache[stock_id].tail(days)
            return pd.DataFrame()

    def get_taiex_data(self, days: int = 60):
        with self._lock:
            if self._taiex_cache is not None: return self._taiex_cache.tail(days)
        df = self.get_price_data("TAIEX", days)
        if not df.empty:
            with self._lock: self._taiex_cache = df
            return df
        return pd.DataFrame()

    def get_chip_data(self, stock_id: str, days: int = 15):
        """籌碼資料 (使用 SDK 方法並相容新舊欄位)"""
        with self._lock:
            if stock_id in self._chip_cache: return self._chip_cache[stock_id].tail(days)
        try:
            start = (datetime.now() - timedelta(days=45)).strftime("%Y-%m-%d")
            df = self.fm_loader.taiwan_stock_institutional_investors(stock_id=stock_id, start_date=start)
            if df is not None and not df.empty:
                df.columns = [c.lower() for c in df.columns]
                if 'name' in df.columns and 'buy' in df.columns:
                    df['net'] = df['buy'] - df['sell']
                    res = df.groupby('date')['net'].sum().reset_index().rename(columns={'net': 'net_buy'})
                else:
                    buy_cols = [c for c in df.columns if 'buy' in c]; sell_cols = [c for c in df.columns if 'sell' in c]
                    if buy_cols and sell_cols:
                        df['net_buy'] = df[buy_cols].sum(axis=1) - df[sell_cols].sum(axis=1)
                        res = df.groupby('date')['net_buy'].sum().reset_index()
                    else: res = pd.DataFrame()
                if not res.empty and 'net_buy' in res.columns:
                    with self._lock: self._chip_cache[stock_id] = res
                    return res.tail(days)
        except: pass
        return pd.DataFrame()

    def get_monthly_revenue(self, stock_id: str):
        with self._lock:
            if stock_id in self._revenue_cache: return self._revenue_cache[stock_id]
        try:
            start = (datetime.now() - timedelta(days=180)).strftime("%Y-%m-%d")
            try: df = self.fm_loader.taiwan_stock_month_revenue(stock_id=stock_id, start_date=start)
            except: df = self.fm_loader.get_data(dataset="TaiwanStockMonthRevenue", stock_id=stock_id, start_date=start)
            if df is not None and not df.empty:
                df = df.sort_values('date'); last = df.iloc[-1]
                res = {"revenue_month": last['date'][:7], "rev_yoy": round(float(last.get('revenue_year_growth_rate', 0)), 2), "rev_mom": round(float(last.get('revenue_month_growth_rate', 0)), 2)}
                with self._lock: self._revenue_cache[stock_id] = res
                return res
        except: pass
        return None

    def get_broker_trades(self, stock_id: str):
        """獲取券商分點買賣超 (免費帳戶受限時回傳空)"""
        with self._lock:
            if stock_id in self._broker_cache: return self._broker_cache[stock_id]
        try:
            price_df = self.get_price_data(stock_id, days=5)
            if price_df.empty: return {"brokers": [], "ratio": 0, "restricted": False}
            now = datetime.now(pytz.timezone("Asia/Taipei"))
            # 判斷最後一筆價格日期是否為今天
            last_date = price_df.index[-1]
            last_date_str = last_date.strftime("%Y-%m-%d")
            
            # 如果最後一筆是今天，且還沒到 17:00，則取前一天
            if last_date.date() == now.date() and now.hour < 17:
                target_date = price_df.index[-2].strftime("%Y-%m-%d")
            else:
                target_date = last_date_str

            try: 
                df = self.fm_loader.taiwan_stock_trading_daily_report(stock_id=stock_id, date=target_date)
            except: 
                # 嘗試自動往前推一天 (避免遇到今日數據尚未更新或假日)
                try:
                    target_date = price_df.index[-2].strftime("%Y-%m-%d")
                    df = self.fm_loader.taiwan_stock_trading_daily_report(stock_id=stock_id, date=target_date)
                except:
                    return {"brokers": [], "ratio": 0, "restricted": True}
            if df is not None and not df.empty:
                df.columns = [c.lower() for c in df.columns]
                broker_col = 'broker_name' if 'broker_name' in df.columns else 'securities_trader_name'
                buy_col = 'buy' if 'buy' in df.columns else 'buy_volume'
                if broker_col in df.columns and buy_col in df.columns:
                    df['net_buy'] = df[buy_col] - df.get('sell', df.get('sell_volume', 0))
                    summary = df.groupby(broker_col)['net_buy'].sum().reset_index()
                    overnight_brokers = summary[summary[broker_col].isin(config.TARGET_BROKERS) & (summary['net_buy'] > 0)].copy()

                    # 估算成本 (使用當日均價作為代理值)
                    try:
                        day_data = price_df.loc[target_date]
                        if isinstance(day_data, pd.DataFrame): day_data = day_data.iloc[0]
                        day_avg_price = round((day_data['Open'] + day_data['High'] + day_data['Low'] + day_data['Close']) / 4, 2)
                    except:
                        day_avg_price = 0

                    overnight_brokers['cost'] = day_avg_price

                    total_vol = df[buy_col].sum()
                    max_single_buy = summary['net_buy'].max() if not summary.empty else 0
                    
                    res = {
                        "date": target_date, 
                        "brokers": overnight_brokers.to_dict('records'), 
                        "ratio": round((overnight_brokers['net_buy'].sum() / total_vol) * 100, 2) if total_vol > 0 else 0, 
                        "max_single_broker_ratio": round((max_single_buy / total_vol) * 100, 2) if total_vol > 0 else 0,
                        "avg_cost": day_avg_price,
                        "restricted": False
                    }
                    with self._lock: self._broker_cache[stock_id] = res
                    return res
        except Exception as e: 
            if self.logger: self.logger.error(f"Broker fetch error for {stock_id}: {e}")
        return {"brokers": [], "ratio": 0, "restricted": True}

    def get_market_status(self):
        now = datetime.now(pytz.timezone("Asia/Taipei"))
        if now.hour < 9: return "盤前 (昨收數據)"
        elif now.hour < 13 or (now.hour == 13 and now.minute < 35): return "盤中 (即時行情)"
        elif now.hour < 14: return "盤後 (收盤緩衝中)"
        else: return "盤後 (今日收盤)"

    def get_hot_battlefield_ids(self, exclude_bank=False):
        with self._lock:
            if self._hot_ids_cache: 
                ids = self._hot_ids_cache
            else:
                # 組合多種篩選來源
                volume_ids = self.get_top_volume_ids(max_price=config.MAX_STOCK_PRICE_FOR_ST_REC, limit=80)
                gainer_ids = self.get_top_gainer_ids(limit=50)
                
                # 合併並去重
                ids = list(dict.fromkeys(volume_ids + gainer_ids))
                self._hot_ids_cache = ids
        
        if exclude_bank:
            return [sid for sid in ids if not self.is_bank(sid)]
        return ids

    def get_top_gainer_ids(self, limit=50):
        """從官方快取獲取漲幅前幾名"""
        with self._lock:
            if not self._official_cache: return []
            data = []
            for sid, info in self._official_cache.items():
                if sid == "TAIEX": continue
                if self.is_etf(sid): continue
                data.append({
                    "Code": sid,
                    "ChangePct": info.get("change_pct", 0),
                    "Price": info.get("price", 0)
                })
            if data:
                df = pd.DataFrame(data)
                # 排除過高價或過低價標的 (視需求調整)
                df = df[df['Price'] <= config.MAX_STOCK_PRICE_FOR_ST_REC]
                return df.sort_values(by='ChangePct', ascending=False).head(limit)['Code'].tolist()
        return []

    def is_bank(self, stock_id: str):
        if self._stock_info_df is None: self.get_all_stock_ids()
        df = self._stock_info_df
        if df is None or df.empty: return False
        
        # 查找該標的的產業類別
        row = df[df['stock_id'] == str(stock_id)]
        if row.empty: return False
        
        col = 'industry' if 'industry' in df.columns else 'industry_category'
        industry = str(row[col].iloc[0])
        return "金融保險" in industry

    def get_popular_etf_ids(self):
        return ["0050", "0056", "00878", "00919", "00929", "006208", "00713", "00881", "0052"]

    def is_etf(self, stock_id: str):
        sid = str(stock_id)
        return sid.startswith("00") or len(sid) > 4

    def get_top_volume_ids(self, max_price=150, limit=50, use_fallback=False, exclude_etf=True):
        # 優先從已同步的官方快取中獲取，避免重複請求大檔案
        with self._lock:
            if self._official_cache:
                data = []
                for sid, info in self._official_cache.items():
                    if sid == "TAIEX": continue
                    data.append({
                        "Code": sid,
                        "TradeVolume": info.get("volume", 0), # 這裡已經是張數或股數？在 fetch 中我除以了 1000
                        "ClosingPrice": info.get("price", 0)
                    })
                if data:
                    df = pd.DataFrame(data)
                    df = df[df['ClosingPrice'] <= max_price]
                    if exclude_etf: df = df[(df['Code'].str.len() == 4) & (~df['Code'].str.startswith("00"))]
                    else: df = df[(df['Code'].str.len() >= 4) & (df['Code'].str.startswith("00"))]
                    return df.sort_values(by='TradeVolume', ascending=False).head(limit)['Code'].tolist()

        try:
            res = self._session.get(config.TWSE_DAY_ALL_URL, timeout=15)
            if res.status_code == 200:
                data = res.json()
                items = data.get('value', data) if isinstance(data, dict) else data
                df = pd.DataFrame(items)
                df['TradeVolume'] = pd.to_numeric(df['TradeVolume'].str.replace(',', ''), errors='coerce')
                df['ClosingPrice'] = pd.to_numeric(df['ClosingPrice'].str.replace(',', ''), errors='coerce')
                df = df.dropna(subset=['ClosingPrice', 'TradeVolume'])
                df = df[df['ClosingPrice'] <= max_price]
                if exclude_etf: df = df[(df['Code'].str.len() == 4) & (~df['Code'].str.startswith("00"))]
                else: df = df[(df['Code'].str.len() >= 4) & (df['Code'].str.startswith("00"))]
                return df.sort_values(by='TradeVolume', ascending=False).head(limit)['Code'].tolist()
        except: pass
        return []

    def sync_if_needed(self):
        """如果官方快取為空或過舊，執行同步 (支援 15 分鐘自動刷新)"""
        need_sync = False
        now = datetime.now(pytz.timezone("Asia/Taipei"))
        now_ts = now.timestamp()
        expected_date_str = self.get_last_expected_trading_date().strftime("%Y-%m-%d")
        
        with self._lock:
            if not self._official_cache:
                need_sync = True
            else:
                # 1. 檢查日期是否不同 (換日同步)
                # 採樣幾個主要的標的來檢查日期 (避免 TAIEX 獨走)
                sample_sids = ["2330", "2317", "TAIEX"]
                cache_dates = [self._official_cache[sid].get('date', "") for sid in sample_sids if sid in self._official_cache]
                
                # 如果採樣標的中有人不是期望的交易日期，且現在是開盤後 (09:00+)
                if now.hour >= 9 and any(d != expected_date_str for d in cache_dates):
                    # 避免在假日時瘋狂發送請求到 OpenAPI (10分鐘冷卻)
                    if (now_ts - getattr(self, '_last_openapi_sync_time', 0)) > 600:
                        need_sync = True
                        self._last_openapi_sync_time = now_ts
                
                # 2. 檢查時間間隔 (盤中每 15 分鐘同步一次)
                if not need_sync and (now_ts - self._last_sync_time) > config.INTRADAY_CACHE_EXPIRY:
                    # 只有在盤中時間才進行自動刷新，避免浪費
                    if 9 <= now.hour <= 14:
                        need_sync = True
                        
                        # 強制刷新邏輯：
                        ts_1335 = now.replace(hour=13, minute=35, second=0).timestamp()
                        ts_1400 = now.replace(hour=14, minute=0, second=0).timestamp()
                        
                        if now_ts >= ts_1335 and self._last_sync_time < ts_1335:
                            if self.logger: self.logger.info("檢測到已過 13:35，強制同步初步收盤數據...")
                        elif now_ts >= ts_1400 and self._last_sync_time < ts_1400:
                            if self.logger: self.logger.info("檢測到已過 14:00，強制同步最終官方收盤價...")
        
        if need_sync:
            self.fetch_twse_openapi()
            
        # 盤中就算 TWSE OpenAPI 抓到舊資料，也用 yfinance 強制覆蓋為最新價格
        now = datetime.now(pytz.timezone("Asia/Taipei"))
        now_date_str = now.strftime("%Y-%m-%d")
        
        # 判斷是否需要用 YF 強制更新
        is_market_open = (9 <= now.hour <= 14 and now.weekday() < 5 and now_date_str not in config.TW_HOLIDAYS_2026)
        # 如果 OpenAPI 取到的快取還是舊的，無論時間都強制更新
        sample_cache_date = self._official_cache.get("2330", {}).get("date", "")
        is_cache_stale = (sample_cache_date != expected_date_str and sample_cache_date != "")
        
        # 節流機制：如果在休市期間 (或假日)，避免因為 is_cache_stale 永遠為 True 而每 3 分鐘瘋狂抓取 YF
        if not hasattr(self, '_last_yf_update_time'): self._last_yf_update_time = 0
        now_ts = now.timestamp()
        can_run = is_market_open or (now_ts - self._last_yf_update_time > 1800) # 休市時最多半小時查一次
        
        if (is_market_open or is_cache_stale) and can_run:
            self._last_yf_update_time = now_ts
            import threading
            threading.Thread(target=self.update_cache_with_realtime).start()

    def update_cache_with_realtime(self):
        """
        強制使用 yfinance 批次取得即時股價，覆寫官方快取中可能停留在昨天的價格。
        這保證大盤多空分布與資金板塊的資料是最即時的。
        """
        now_date_str = datetime.now(pytz.timezone("Asia/Taipei")).strftime("%Y-%m-%d")
        
        with self._lock:
            sids = [sid for sid in self._official_cache.keys() if sid not in ['TPEX']]
            # 將 TAIEX 納入，確保大盤也即時更新
        
        if not sids: return
        
        if self.logger: self.logger.info(f"正在透過 YF 即時修正 {len(sids)} 檔標的價格...")
        sym_map = self.get_symbol_map()
        sym_map["TAIEX"] = "^TWII"
        
        batch_size = 300
        for i in range(0, len(sids), batch_size):
            batch_sids = sids[i:i+batch_size]
            tickers = [sym_map.get(sid, f"{sid}.TW") for sid in batch_sids]
            
            try:
                data = yf.download(tickers, period="5d", interval="1d", group_by='ticker', threads=True, progress=False, auto_adjust=False)
                with self._lock:
                    for sid in batch_sids:
                        ticker = sym_map.get(sid, f"{sid}.TW")
                        df = pd.DataFrame()
                        if isinstance(data.columns, pd.MultiIndex):
                            if ticker in data.columns.levels[0]:
                                df = data[ticker].dropna(subset=['Close'])
                        elif len(tickers) == 1:
                            df = data.dropna(subset=['Close'])
                            
                        if df.empty: continue
                        
                        last_close = float(df['Close'].iloc[-1])
                        actual_date_str = df.iloc[-1].name.strftime("%Y-%m-%d")
                        
                        # 覆蓋官方快取
                        if sid in self._official_cache:
                            # 保留昨收價來算準確的漲跌幅
                            yday_price = self._official_cache[sid].get('price', last_close)
                            # 如果官方資料還沒到今天，那它存的 price 就是昨收
                            if self._official_cache[sid].get('date') != actual_date_str:
                                yday_price = self._official_cache[sid]['price']
                            elif 'yday_price' in self._official_cache[sid]:
                                yday_price = self._official_cache[sid]['yday_price']
                                
                            change_pct = round(((last_close - yday_price) / yday_price) * 100, 2) if yday_price else 0.0
                            
                            self._official_cache[sid]['price'] = last_close
                            self._official_cache[sid]['change_pct'] = change_pct
                            self._official_cache[sid]['date'] = actual_date_str
                            self._official_cache[sid]['yday_price'] = yday_price
            except Exception as e:
                if self.logger: self.logger.warning(f"YF 即時批次修正發生錯誤: {e}")

    def prefetch_intraday_data(self, sids):
        """批次下載 1m 即時行情數據 (優化分批)"""
        if not sids: return
        
        # 排除鮮活的快取
        needed_sids = []
        now = datetime.now(pytz.timezone("Asia/Taipei"))
        with self._lock:
            for sid in sids:
                if sid in self._intraday_cache:
                    cache_time, _ = self._intraday_cache[sid]
                    if (now - cache_time.astimezone(pytz.timezone("Asia/Taipei"))).total_seconds() < config.INTRADAY_CACHE_EXPIRY:
                        continue
                needed_sids.append(sid)
        
        if not needed_sids:
            print(f"[系統] {len(sids)} 檔標的之即時快取已就緒。")
            return

        print(f"[系統] 正在批次同步 {len(needed_sids)} 檔標的之即時 1m 數據...")
        sym_map = self.get_symbol_map()
        
        # 判斷目前市場狀態
        market_open = now.replace(hour=9, minute=0, second=0, microsecond=0)
        market_close = now.replace(hour=13, minute=35, second=0, microsecond=0)
        is_during_market = market_open <= now <= market_close

        # 分批下載，每批 50 檔，避免 yfinance 超時或失敗
        batch_size = 50
        for i in range(0, len(needed_sids), batch_size):
            batch_sids = needed_sids[i:i+batch_size]
            tickers = [sym_map.get(sid, f"{sid}.TW") for sid in batch_sids]
            print(f"   即時同步進度: {min(i+batch_size, len(needed_sids))}/{len(needed_sids)}", end="\r")
            
            try:
                data = yf.download(tickers, period="5d", interval="1m", group_by='ticker', threads=True, progress=False, auto_adjust=False)
                for sid in batch_sids:
                    ticker = sym_map.get(sid, f"{sid}.TW")
                    try:
                        if isinstance(data.columns, pd.MultiIndex):
                            if ticker not in data.columns.levels[0]: continue
                            df = data[ticker].dropna(subset=['Close'])
                        else:
                            if len(tickers) == 1: df = data.dropna(subset=['Close'])
                            else: continue
                        
                        if df.empty: continue
                        df.index = df.index.tz_convert("Asia/Taipei")
                        # 確保價格精確度
                        for col in ['Open', 'High', 'Low', 'Close']:
                            df[col] = df[col].round(2)
                        
                        all_dates = sorted(df.index.normalize().unique())
                        
                        # 判定時間區間 (同步 get_intraday_data 邏輯)
                        is_early_morning = now.hour < 9
                        is_weekend = now.weekday() >= 5
                        
                        last_data_date = all_dates[-1]
                        is_last_data_today = (last_data_date.date() == now.date())
                        
                        is_market_hours = (not is_weekend) and (not is_early_morning) and (now < market_close)
                        is_during_market = is_market_hours and is_last_data_today
                        
                        price_df = df[df.index.normalize() == last_data_date]
                        
                        if is_during_market:
                            ref_df = df[df.index.normalize() == all_dates[-2]] if len(all_dates) >= 2 else price_df
                        else:
                            ref_df = price_df

                        # 決定 CDP 基準資料 (H, L, C)
                        ref_date_str = ref_df.index[-1].strftime("%Y-%m-%d")
                        official_data = self._official_cache.get(sid)
                        
                        if official_data and official_data.get('date') == ref_date_str:
                            yesterday_high = float(official_data['high'])
                            yesterday_low = float(official_data['low'])
                            yesterday_close = float(official_data['price'])
                        else:
                            yesterday_high = float(ref_df['High'].max())
                            yesterday_low = float(ref_df['Low'].min())
                            yesterday_close = float(ref_df['Close'].iloc[-1])

                        # 計算昨日均價 (VWAP)
                        try:
                            yesterday_avg = (ref_df['Close'] * ref_df['Volume']).sum() / (ref_df['Volume'].sum() + 1e-9)
                        except:
                            yesterday_avg = (yesterday_high + yesterday_low + yesterday_close) / 3

                        cdp_base_date = ref_date_str

                        last_price = float(price_df['Close'].iloc[-1])
                        
                        # 盤後修正：如果已經收盤 (13:30 後) 且有官方快取，強制覆蓋為官方收盤價
                        if now.hour > 13 or (now.hour == 13 and now.minute >= 30):
                            if official_data and official_data.get('date') == now.strftime("%Y-%m-%d"):
                                if not pd.isna(official_data.get('price')):
                                    last_price = float(official_data['price'])
                                    
                        price_1325_df = price_df.between_time("13:24", "13:25")
                        price_1325 = float(price_1325_df['Close'].iloc[-1]) if not price_1325_df.empty else last_price
                        
                        res = {
                            "stock_id": sid, "price": last_price, 
                            "open": float(price_df['Open'].iloc[0]) if (is_last_data_today and not is_early_morning) else last_price,
                            "high": float(price_df['High'].max()), "low": float(price_df['Low'].min()),
                            "yesterday_high": yesterday_high, "yesterday_low": yesterday_low, "yesterday_close": yesterday_close, 
                            "yesterday_avg": round(yesterday_avg, 2),
                            "cdp_base_date": cdp_base_date,
                            "price_1325": price_1325,
                            "max_vol_after_1300": int(price_df.between_time("13:00", "13:30")['Volume'].max()) if not price_df.between_time("13:00", "13:30").empty else 0,
                            "auction_jump": round(((last_price - price_1325) / price_1325) * 100, 2) if price_1325 > 0 else 0,
                            "df_1m": price_df.copy(), "df_5m": price_df['Close'].resample('5min').ohlc()
                        }
                        with self._lock: self._intraday_cache[sid] = (datetime.now(pytz.timezone("Asia/Taipei")), res)
                    except: continue
            except Exception as e:
                if self.logger: self.logger.error(f"Batch intraday fetch error in batch {i}: {e}")
        print(f"\n[系統] 即時數據同步完成。")

    def get_all_stock_ids(self):
        """獲取所有「交易中」的股票代碼，自動過濾下市標的"""
        try:
            with self._lock:
                if self._stock_info_df is not None and not self._stock_info_df.empty:
                    return self._stock_info_df['stock_id'].tolist()
            
            # 1. 優先獲取 TWSE/TPEx 當日行情作為「活躍標的」基準
            twse_ids = set()
            tpex_ids = set()
            try:
                # TWSE 活躍列表
                res = self._session.get(config.TWSE_DAY_ALL_URL, timeout=10)
                if res.status_code == 200:
                    data = res.json()
                    items = data.get('value', data) if isinstance(data, dict) else data
                    for item in items: twse_ids.add(str(item.get('Code', '')))
                
                # TPEx 活躍列表
                res = self._session.get(config.TPEX_DAY_ALL_URL, timeout=10)
                if res.status_code == 200:
                    data = res.json()
                    items = data.get('value', data) if isinstance(data, dict) else data
                    for item in items: tpex_ids.add(str(item.get('SecuritiesCompanyCode', '')))
            except: pass

            active_ids = twse_ids.union(tpex_ids)

            # 2. 獲取基本資訊 (產業、型態)
            try:
                df = self.fm_loader.taiwan_stock_info()
            except:
                df = self._stock_info_df if self._stock_info_df is not None else pd.DataFrame()

            if df is not None and not df.empty:
                df['stock_id'] = df['stock_id'].astype(str)
                # 關鍵：若能獲取活躍列表，則嚴格過濾掉下市標的
                if active_ids:
                    df = df[df['stock_id'].isin(active_ids)]
                    
                    # 覆蓋型態標記，使用最準確的 OpenAPI 分類
                    def assign_type(sid):
                        if sid in twse_ids: return 'twse'
                        if sid in tpex_ids: return 'tpex'
                        return None
                    df['type'] = df['stock_id'].apply(assign_type).combine_first(df['type'])
                
                # 去重 (保留最新日期的紀錄)
                if 'date' in df.columns:
                    df = df.sort_values('date').drop_duplicates('stock_id', keep='last')
                
                with self._lock:
                    self._stock_info_df = df
                    self._build_id_maps()
                self._save_local_stock_info()
                return df['stock_id'].tolist()
        except: pass
        return []

    def resolve_stock_id(self, query: str):
        if not self._stock_id_map: self.fetch_twse_openapi(fetch_all=False)
        query = str(query).strip()
        if query in self._stock_id_map: return query
        if query in self._stock_name_map: return self._stock_name_map[query]
        for name, sid in self._stock_name_map.items():
            if query in name: return sid
        return None

    def get_industry_list(self):
        if self._stock_info_df is None: self.get_all_stock_ids()
        df = self._stock_info_df
        if df is None or df.empty: return ["半導體業", "金融保險業", "航運業", "電子零組件業"]
        
        col = 'industry' if 'industry' in df.columns else 'industry_category'
        if col not in df.columns: return ["半導體業", "金融保險業", "航運業", "電子零組件業"]
        
        raw_industries = df[col].dropna().unique().tolist()
        normalized = set()
        for ind in raw_industries:
            ind = str(ind).strip()
            # 排除非產業項目
            if not ind or any(x in ind for x in ["所有證券", "受益證券", "Index", "存託憑證", "大盤", "ETF", "ETN", "基金"]): 
                continue
            
            # 深度標準化：統一結尾為 "業"
            if ind.endswith("類"): ind = ind[:-1] + "業"
            if not ind.endswith("業"): ind = ind + "業"
            
            # 清理贅字與錯字
            ind = ind.replace("股票", "").replace("版", "板")
            # 強力合併相似項目
            if "金融" in ind: ind = "金融保險業"
            if "化學" in ind and "醫療" not in ind: ind = "化學工業"
            if "居家" in ind: ind = "居家生活業"
            if "數位" in ind: ind = "數位雲端業"
            if "運動" in ind: ind = "運動休閒業"
            if "農業" in ind: ind = "農業科技業"
            if "綠能" in ind: ind = "綠能環保業"
            if "觀光" in ind: ind = "觀光餐旅業"
            
            normalized.add(ind)
            
        return sorted(list(normalized))

    def search_stocks_by_industry(self, industry_name: str):
        if self._stock_info_df is None: self.get_all_stock_ids()
        df = self._stock_info_df
        if df is None or df.empty: return []
        
        col = 'industry' if 'industry' in df.columns else 'industry_category'
        if col not in df.columns: return []
        
        # 模糊比對以支援標準化後的名稱
        target = industry_name.replace("業", "").replace("板", "")
        if "金融" in target: target = "金融"
        
        mask = (df[col].str.contains(target, na=False)) & (df['type'].str.lower().isin(['twse', 'tpex', 'otc']))
        # 排除 ETF (00開頭) 與非 4 碼股票 (權證/債券)
        mask = mask & (~df['stock_id'].str.startswith("00")) & (df['stock_id'].str.len() == 4)
        
        return df[mask]['stock_id'].tolist()[:30]

    def get_comprehensive_news(self):
        """獲取台股公告與市場新聞"""
        items = []
        
        # 0. Yahoo 奇摩股市新聞 (台股要聞)
        try:
            from bs4 import BeautifulSoup
            res = self._session.get("https://tw.stock.yahoo.com/news/", headers={'User-Agent': 'Mozilla/5.0'}, timeout=10)
            if res.status_code == 200:
                soup = BeautifulSoup(res.text, 'html.parser')
                today_str = datetime.now().strftime("%Y-%m-%d")
                seen = set()
                for a in soup.find_all('a'):
                    if 'href' in a.attrs and '/news/' in a['href']:
                        title = a.text.strip()
                        if len(title) > 10 and title not in seen:
                            seen.add(title)
                            link = a['href']
                            if not link.startswith('http'):
                                link = "https://tw.stock.yahoo.com" + link
                            items.append({
                                "title": f"[要聞] {title}",
                                "url": link,
                                "source": "Yahoo財經",
                                "time": today_str
                            })
                            if len(items) >= 15:
                                break
        except Exception as e:
            if self.logger: self.logger.warning(f"Failed to fetch Yahoo TW news: {e}")

        # 1. TWSE 官方公告
        try:
            res = self._session.get(config.TWSE_NEWS_URL, timeout=10)
            if res.status_code == 200:
                for item in res.json()[:15]:
                    title = item.get("Title")
                    url_link = item.get("Url")
                    if title: 
                        items.append({
                            "title": f"[公告] {title}", 
                            "url": url_link if url_link else "",
                            "source": "證交所",
                            "time": datetime.now().strftime("%Y-%m-%d")
                        })
        except: pass

        # 2. Yahoo Finance 台股市場新聞 (針對 ^TWII)
        try:
            t = yf.Ticker("^TWII")
            yf_news = t.news[:20]
            for item in yf_news:
                content = item.get("content", {})
                title = content.get("title") or item.get("title")
                link = content.get("canonicalUrl", {}).get("url") or item.get("link")
                pubDate = content.get("pubDate") or item.get("providerPublishTime")
                publisher = content.get("provider", {}).get("displayName") or item.get("publisher", "Yahoo")
                
                time_str = ""
                if pubDate:
                    try:
                        time_str = datetime.fromisoformat(str(pubDate).replace("Z", "+00:00")).strftime("%m-%d %H:%M")
                    except:
                        try: time_str = datetime.fromtimestamp(pubDate).strftime("%m-%d %H:%M")
                        except: pass
                        
                if title:
                    items.append({
                        "title": f"[市場] {title}", 
                        "url": link if link else "",
                        "source": publisher,
                        "time": time_str
                    })
        except: pass

        # 3. 補充更多財經新聞來源 (Yahoo 台股熱門)
        try:
            for extra_ticker in ["2330.TW", "2317.TW", "2454.TW"]:
                t2 = yf.Ticker(extra_ticker)
                for item in (t2.news or [])[:5]:
                    content = item.get("content", {})
                    title = content.get("title") or item.get("title")
                    link = content.get("canonicalUrl", {}).get("url") or item.get("link")
                    pubDate = content.get("pubDate") or item.get("providerPublishTime")
                    publisher = content.get("provider", {}).get("displayName") or item.get("publisher", "Yahoo")
                    
                    time_str = ""
                    if pubDate:
                        try:
                            time_str = datetime.fromisoformat(str(pubDate).replace("Z", "+00:00")).strftime("%m-%d %H:%M")
                        except:
                            try: time_str = datetime.fromtimestamp(pubDate).strftime("%m-%d %H:%M")
                            except: pass
                    
                    if title and not any(existing['title'].endswith(title) for existing in items):
                        items.append({
                            "title": f"[產業] {title}",
                            "url": link if link else "",
                            "source": publisher,
                            "time": time_str
                        })
        except: pass

        return items, []

    def get_ptt_sentiment(self):
        """爬取 PTT Stock 版標題並計算情緒分數"""
        try:
            url = "https://www.ptt.cc/bbs/Stock/index.html"
            headers = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36"}
            cookies = {"over18": "1"}
            res = requests.get(url, headers=headers, cookies=cookies, timeout=10)
            if res.status_code != 200: return None
            
            html = res.text
            # 簡單正則提取標題 (ptt 標題在 <div class="title">...</div> 內)
            titles = re.findall(r'<div class="title">\s*<a[^>]*>(.*?)</a>', html, re.S)
            
            # 定義情緒關鍵字
            pos_words = ["多", "噴", "漲", "起飛", "買進", "利多", "強勢", "拉抬"]
            neg_words = ["空", "跌", "崩", "逃", "慘", "套", "割", "利空", "出貨", "殺"]
            
            pos_count = 0
            neg_count = 0
            hot_titles = []
            
            for t in titles[:20]: # 只看最新 20 則
                t = t.strip()
                # 排除固定公告
                if "[公告]" in t: continue
                
                hot_titles.append(t)
                for w in pos_words:
                    if w in t: pos_count += 1
                for w in neg_words:
                    if w in t: neg_count += 1
            
            total = pos_count + neg_count + 1e-9
            score = round((pos_count / total) * 100, 1)
            
            return {
                "score": score,
                "pos_count": pos_count,
                "neg_count": neg_count,
                "titles": hot_titles[:8]
            }
        except Exception as e:
            if self.logger: self.logger.error(f"PTT scrape error: {e}")
            return None

    def get_taiwan_futures(self):
        """獲取台指期貨行情 (含夜盤) - 修正漲跌基準"""
        try:
            start = (datetime.now() - timedelta(days=7)).strftime("%Y-%m-%d")
            df = self.fm_loader.taiwan_futures_daily(futures_id='TX', start_date=start)
            if df is not None and not df.empty:
                # 依日期與成交量排序，並區分一般與夜盤
                df = df.sort_values(['date', 'trading_session'], ascending=[False, False])
                
                # 找出最新的那一個 session
                latest_session = df.iloc[0]
                price = float(latest_session['close'])
                
                # 漲跌基準：應該與「前一個 session 的收盤價」對比
                prev_price = price
                if len(df) >= 2:
                    prev_price = float(df.iloc[1]['close'])
                
                change_pct = round(((price - prev_price) / (prev_price + 1e-9)) * 100, 2)
                
                return {
                    "price": price,
                    "change_pct": change_pct,
                    "session": "夜盤" if latest_session['trading_session'] == 'after_market' else "一般盤",
                    "date": latest_session['date']
                }
        except: pass
        return None

    def get_realtime_wtx(self):
        """抓取 Yahoo Finance TW 即時台指期 (WTX& / WTXP&)"""
        try:
            import requests
            import re
            res = requests.get('https://tw.stock.yahoo.com/quote/WTX%26', headers={'User-Agent': 'Mozilla/5.0'}, timeout=5)
            price_match = re.search(r'"regularMarketPrice"\s*:\s*(?:\{.*?"raw"\s*:\s*"?|"?|)(\d+(?:\.\d+)?)', res.text)
            prev_match = re.search(r'"regularMarketPreviousClose"\s*:\s*(?:\{.*?"raw"\s*:\s*"?|"?|)(\d+(?:\.\d+)?)', res.text)
            
            if price_match and prev_match:
                price = float(price_match.group(1))
                prev = float(prev_match.group(1))
                change_pct = round(((price - prev) / (prev + 1e-9)) * 100, 2)
                return {
                    "price": price,
                    "change_pct": change_pct,
                    "session": "即時",
                    "date": datetime.now().strftime("%Y-%m-%d %H:%M")
                }
        except: pass
        return None

    def get_global_markets(self):
        """獲取全球主要指數行情 - 使用 FinMind API 確保數據最新，yfinance 作為備份"""
        FINMIND_TOKEN = os.environ.get("FINMIND_API_TOKEN")
        FM_API = "https://api.finmindtrade.com/api/v4/data"
        
        results = {}
        start_date = (datetime.now() - timedelta(days=10)).strftime("%Y-%m-%d")
        
        # FinMind 可查的美股個股/ETF與指數 (使用 USStockPrice 資料集)
        fm_us_stocks = {
            "標普500": "^GSPC",
            "那斯達克": "^IXIC",
            "費半指數": "^SOX",
            "道瓊工業": "^DJI",
            "輝達": "NVDA",
            "台積電ADR": "TSM",
            "台股ETF(美)": "EWT",
        }
        
        # yfinance 查詢的美股指數 (FinMind 沒有這些，或使用 yf 更穩定)
        yf_indices = {
            "美元/台幣": "TWD=X",
            "台股大盤": "^TWII",
        }
        
        # 1. 使用 FinMind 抓美股個股與 ETF (最新日線數據)
        for name, symbol in fm_us_stocks.items():
            try:
                params = {
                    "dataset": "USStockPrice",
                    "data_id": symbol,
                    "start_date": start_date,
                    "token": FINMIND_TOKEN
                }
                resp = requests.get(FM_API, params=params, timeout=10)
                if resp.status_code == 200:
                    raw = resp.json()
                    rows = raw.get("data", [])
                    if rows:
                        rows_sorted = sorted(rows, key=lambda x: x["date"])
                        last = rows_sorted[-1]
                        prev = rows_sorted[-2] if len(rows_sorted) >= 2 else last
                        
                        # FinMind USStockPrice 欄位開頭為大寫 Close
                        price = float(last.get("Close", last.get("close", 0)))
                        prev_price = float(prev.get("Close", prev.get("close", price)))
                        
                        change_pct = round(((price - prev_price) / (prev_price + 1e-9)) * 100, 2) if prev_price else 0
                        results[name] = {
                            "price": round(price, 2),
                            "change_pct": change_pct,
                            "symbol": symbol,
                            "date": last["date"]
                        }
            except Exception as e:
                if self.logger: self.logger.warning(f"FinMind USStockPrice failed for {symbol}: {e}")
        
        # 2. 使用 yfinance 抓指數與匯率 (FinMind 免費版不提供)
        try:
            yf_tickers = list(yf_indices.values())
            data = yf.download(yf_tickers, period="5d", interval="1d", group_by='ticker', threads=True, progress=False, auto_adjust=False)
            
            for name, symbol in yf_indices.items():
                try:
                    if isinstance(data.columns, pd.MultiIndex):
                        if symbol not in data.columns.levels[0]: continue
                        ticker_data = data[symbol].dropna(subset=['Close'])
                    else:
                        if len(yf_tickers) == 1: ticker_data = data.dropna(subset=['Close'])
                        else: continue
                    
                    if not ticker_data.empty:
                        last_row = ticker_data.iloc[-1]
                        price = float(last_row['Close'])
                        date_str = last_row.name.strftime('%Y-%m-%d')
                        
                        prev_price = float(ticker_data.iloc[-2]['Close']) if len(ticker_data) >= 2 else price
                        change_pct = round(((price - prev_price) / (prev_price + 1e-9)) * 100, 2)
                        
                        if symbol == "TWD=X":
                            price = round(price, 3)
                        else:
                            price = round(price, 2)
                            
                        results[name] = {
                            "price": price,
                            "change_pct": change_pct,
                            "symbol": symbol,
                            "date": date_str
                        }
                except: continue
        except Exception as e:
            if self.logger: self.logger.error(f"yfinance indices fetch error: {e}")
        
        # 3. 台股大盤若官方快取比 yfinance 更新，則覆蓋
        if "TAIEX" in self._official_cache:
            off = self._official_cache["TAIEX"]
            off_date = off.get("date", "")
            yf_taiex_date = results.get("台股大盤", {}).get("date", "")
            try:
                if not pd.isna(off.get("price")) and not pd.isna(off.get("change_pct")):
                    if off_date >= yf_taiex_date or yf_taiex_date == "":
                        results["台股大盤"] = {
                            "price": off["price"],
                            "change_pct": off["change_pct"],
                            "symbol": "^TWII",
                            "date": off_date
                        }
            except: pass
                
        return results


    def get_global_news(self):
        """獲取全球財經新聞 (從主要指數 Ticker 獲取)"""
        try:
            # 獲取標普500的新聞作為全球財經新聞代表
            t = yf.Ticker("^GSPC")
            news = t.news[:10]
            items = []
            for item in news:
                content = item.get("content", {})
                title = content.get("title") or item.get("title")
                link = content.get("canonicalUrl", {}).get("url") or item.get("link")
                pubDate = content.get("pubDate") or item.get("providerPublishTime")
                publisher = content.get("provider", {}).get("displayName") or item.get("publisher", "Yahoo")
                
                time_str = ""
                if pubDate:
                    try:
                        time_str = datetime.fromisoformat(str(pubDate).replace("Z", "+00:00")).strftime("%m-%d %H:%M")
                    except:
                        try: time_str = datetime.fromtimestamp(pubDate).strftime("%m-%d %H:%M")
                        except: pass
                if title:
                    items.append({
                        "title": title, 
                        "url": link if link else "",
                        "source": publisher,
                        "time": time_str
                    })
            return items
        except:
            return []

    def get_capital_flow(self):
        """
        計算今日台股資金流向 (各產業成交比重、漲跌幅、以及推薦的熱門股)
        """
        if self._stock_info_df is None: self.get_all_stock_ids()
        if not self._official_cache: self.fetch_twse_openapi(fetch_all=False)
        
        df = self._stock_info_df
        if df is None or df.empty: return []
        col = 'industry' if 'industry' in df.columns else 'industry_category'
        if col not in df.columns: return []
        
        industry_stats = {}
        total_market_value = 0
        
        # 1. 統計各產業成交總值與漲跌幅
        for _, row in df.iterrows():
            sid = str(row['stock_id'])
            ind = str(row[col]).strip()
            
            # 過濾無效產業
            if not ind or any(x in ind for x in ["不適用", "認購證券", "Index", "存託憑證", "大盤", "ETF", "ETN", "受益", "債券"]): 
                continue
            if ind.endswith("業"): ind = ind[:-1] + "類"
            if not ind.endswith("類"): ind = ind + "類"
            if "半導體" in ind: ind = "半導體類"
            ind = ind.replace("股票", "").replace("-", "")
            
            if sid in self._official_cache:
                info = self._official_cache[sid]
                # info["volume"] 是張數(千股)
                val = info.get("price", 0) * info.get("volume", 0) * 1000
                cpct = info.get("change_pct", 0)
                
                if ind not in industry_stats:
                    industry_stats[ind] = {"total_value": 0, "sum_change": 0, "count": 0, "stocks": []}
                
                industry_stats[ind]["total_value"] += val
                industry_stats[ind]["sum_change"] += cpct
                industry_stats[ind]["count"] += 1
                industry_stats[ind]["stocks"].append({"id": sid, "name": info.get("name", ""), "value": val, "change_pct": cpct, "price": info.get("price")})
                total_market_value += val
        
        # 2. 計算比重與排序
        results = []
        for ind, stats in industry_stats.items():
            if stats["total_value"] == 0: continue
            
            ratio = (stats["total_value"] / total_market_value) * 100 if total_market_value > 0 else 0
            avg_change = stats["sum_change"] / stats["count"] if stats["count"] > 0 else 0
            
            # 挑選該產業中成交值最大的前5檔股票作為代表
            top_stocks = sorted(stats["stocks"], key=lambda x: x["value"], reverse=True)[:5]
            
            results.append({
                "industry": ind,
                "value_ratio": round(ratio, 2),
                "avg_change_pct": round(avg_change, 2),
                "total_value_ntd": int(stats["total_value"]),
                "top_stocks": top_stocks
            })
            
        market_stats = {"up": 0, "down": 0, "limit_up": 0, "limit_down": 0, "unchanged": 0}
        
        for sid, info in self._official_cache.items():
            if sid == "TAIEX": continue
            # Only count regular stocks and ETFs (length 4 or starts with 00)
            if len(sid) != 4 and not sid.startswith("00"): continue
            
            cpct = info.get("change_pct", 0)
            if cpct >= 9.5:
                market_stats["limit_up"] += 1
                market_stats["up"] += 1
            elif cpct <= -9.5:
                market_stats["limit_down"] += 1
                market_stats["down"] += 1
            elif cpct > 0:
                market_stats["up"] += 1
            elif cpct < 0:
                market_stats["down"] += 1
            else:
                market_stats["unchanged"] += 1
                
        # 依成交比重降序排列
        results = sorted(results, key=lambda x: x["value_ratio"], reverse=True)
        
        # BACKWARD COMPATIBILITY: Return a list to prevent old clients from crashing
        # We attach market_stats to a special attribute on the first element so new clients can extract it
        if results:
            results[0]["_market_stats"] = market_stats
            
        return results

    def get_market_breadth(self):
        """
        計算大盤多空寬度 (漲跌家數分佈與平盤統計)
        """
        import math
        if not self._official_cache: self.fetch_twse_openapi(fetch_all=False)
        
        # Initialize buckets from -10 to 10
        histogram_map = {i: 0 for i in range(-10, 11)}
        summary = {"up": 0, "down": 0, "limit_up": 0, "limit_down": 0, "unchanged": 0}
        
        for sid, info in self._official_cache.items():
            if sid == "TAIEX": continue
            # Only count regular stocks and ETFs (length 4 or starts with 00)
            if len(sid) != 4 and not sid.startswith("00"): continue
            
            cpct = info.get("change_pct", 0)
            
            # Update summary
            if cpct >= 9.5:
                summary["limit_up"] += 1
                summary["up"] += 1
                bucket = 10
            elif cpct <= -9.5:
                summary["limit_down"] += 1
                summary["down"] += 1
                bucket = -10
            elif cpct > 0:
                summary["up"] += 1
                bucket = int(math.ceil(cpct))
                if bucket > 9: bucket = 9
            elif cpct < 0:
                summary["down"] += 1
                bucket = int(math.floor(cpct))
                if bucket < -9: bucket = -9
            else:
                summary["unchanged"] += 1
                bucket = 0
                
            histogram_map[bucket] += 1
            
        # Format for Recharts
        histogram = [{"range": k, "count": v} for k, v in sorted(histogram_map.items())]
        
        return {
            "histogram": histogram,
            "summary": summary
        }
    def get_institutional_flow(self, days=30):
        """
        獲取大盤三大法人買賣超 (法人資金動向) 歷史資料 (近N天)
        """
        start_date = (datetime.now() - timedelta(days=days)).strftime("%Y-%m-%d")
        try:
            df = self.fm_loader.taiwan_stock_institutional_investors_total(start_date=start_date)
            if df is None or df.empty:
                import pandas as pd
                cache_path = os.path.join(os.path.dirname(__file__), "..", "assets", "finmind_cache_fallback.json")
                if os.path.exists(cache_path):
                    df = pd.read_json(cache_path)
                    df = df[df['date'] >= start_date]
                else:
                    return []
            
            # DataFrame cols: buy, date, name, sell
            # We want to group by date and pivot names: 'Dealer_Hedging', 'Foreign_Investor', 'Dealer_self', 'Foreign_Dealer_Self', 'total'
            # (or we can just group by date)
            results = []
            
            # map finmind names to readable chinese names
            name_map = {
                'Foreign_Investor': '外資及陸資',
                'Investment_Trust': '投信',
                'Dealer_self': '自營商(自行買賣)',
                'Dealer_Hedging': '自營商(避險)',
                'Foreign_Dealer_Self': '外資自營商',
                'total': '合計'
            }
            
            for date_val, group in df.groupby('date'):
                day_data = {'date': str(date_val)}
                for _, row in group.iterrows():
                    nm = row['name']
                    buy = int(row.get('buy', 0))
                    sell = int(row.get('sell', 0))
                    net = buy - sell
                    if nm in name_map:
                        ch_name = name_map[nm]
                        day_data[ch_name] = net
                    else:
                        day_data[nm] = net
                
                # merge dealers if both exist (or keep them separated, up to UI)
                dealer_total = day_data.get('自營商(自行買賣)', 0) + day_data.get('自營商(避險)', 0)
                day_data['自營商'] = dealer_total
                
                results.append(day_data)
                
            # sort by date ascending
            results = sorted(results, key=lambda x: x['date'])
            return results
        except Exception as e:
            print(f"Error fetching institutional flow: {e}")
            import pandas as pd
            cache_path = os.path.join(os.path.dirname(__file__), "..", "assets", "finmind_cache_fallback.json")
            if os.path.exists(cache_path):
                try:
                    df = pd.read_json(cache_path)
                    df = df[df['date'] >= start_date]
                    
                    results = []
                    name_map = {
                        'Foreign_Investor': '外資及陸資',
                        'Investment_Trust': '投信',
                        'Dealer_self': '自營商(自行買賣)',
                        'Dealer_Hedging': '自營商(避險)',
                        'Foreign_Dealer_Self': '外資自營商',
                        'total': '合計'
                    }
                    
                    for date_val, group in df.groupby('date'):
                        day_data = {'date': str(date_val)}
                        for _, row in group.iterrows():
                            nm = row['name']
                            buy = int(row.get('buy', 0))
                            sell = int(row.get('sell', 0))
                            net = buy - sell
                            if nm in name_map:
                                ch_name = name_map[nm]
                                day_data[ch_name] = net
                            else:
                                day_data[nm] = net
                        
                        dealer_total = day_data.get('自營商(自行買賣)', 0) + day_data.get('自營商(避險)', 0)
                        day_data['自營商'] = dealer_total
                        
                        results.append(day_data)
                        
                    results = sorted(results, key=lambda x: x['date'])
                    return results
                except:
                    pass
            return {"error": str(e)}
