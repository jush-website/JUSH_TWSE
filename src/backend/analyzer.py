import pandas as pd
import numpy as np
from src.backend import config
import pytz
from src.backend.data_fetcher import DataFetcher
from datetime import datetime

class StockAnalyzer:
    def __init__(self, fetcher=None):
        self.fetcher = fetcher if fetcher else DataFetcher()

    def calculate_kd(self, df, n=config.KD_WINDOW, m1=config.KD_M1, m2=config.KD_M2):
        low_list = df['Low'].rolling(window=n).min()
        high_list = df['High'].rolling(window=n).max()
        diff = (high_list - low_list).replace(0, 1e-9)
        rsv = (df['Close'] - low_list) / diff * 100
        k = rsv.fillna(50).ewm(com=m1-1, adjust=False).mean()
        d = k.ewm(com=m2-1, adjust=False).mean()
        return k, d

    def calculate_rsi(self, df, n=config.RSI_WINDOW):
        delta = df['Close'].diff()
        gain = (delta.where(delta > 0, 0)).rolling(window=n).mean()
        loss = (-delta.where(delta < 0, 0)).rolling(window=n).mean()
        rs = gain / (loss + 1e-9)
        return 100 - (100 / (1 + rs))

    def calculate_macd(self, df, fast=config.MACD_FAST, slow=config.MACD_SLOW, signal=config.MACD_SIGNAL):
        ema_fast = df['Close'].ewm(span=fast, adjust=False).mean()
        ema_slow = df['Close'].ewm(span=slow, adjust=False).mean()
        dif = ema_fast - ema_slow
        dea = dif.ewm(span=signal, adjust=False).mean()
        return dif, dea, (dif - dea) * 2

    def calculate_bollinger_bands(self, df, n=config.BOLLINGER_WINDOW, k=config.BOLLINGER_STD):
        sma = df['Close'].rolling(window=n).mean()
        std = df['Close'].rolling(window=n).std()
        upper = sma + (k * std); lower = sma - (k * std)
        return upper, sma, lower

    def calculate_dmi(self, df, n=14):
        """計算 DMI (+DI, -DI) 與 ADX"""
        up_move = df['High'].diff(); down_move = df['Low'].diff()
        plus_dm = np.where((up_move > down_move) & (up_move > 0), up_move, 0)
        minus_dm = np.where((down_move > up_move) & (down_move > 0), down_move, 0)
        
        tr1 = df['High'] - df['Low']
        tr2 = abs(df['High'] - df['Close'].shift(1))
        tr3 = abs(df['Low'] - df['Close'].shift(1))
        tr = pd.concat([tr1, tr2, tr3], axis=1).max(axis=1)
        
        atr = tr.rolling(window=n).mean()
        plus_di = 100 * (pd.Series(plus_dm).rolling(window=n).mean() / (atr + 1e-9))
        minus_di = 100 * (pd.Series(minus_dm).rolling(window=n).mean() / (atr + 1e-9))
        
        dx = 100 * abs(plus_di - minus_di) / (plus_di + minus_di + 1e-9)
        adx = dx.rolling(window=n).mean()
        
        return plus_di, minus_di, adx

    def calculate_obv(self, df):
        """計算能量潮 (OBV)"""
        obv = (np.sign(df['Close'].diff()) * df['Volume']).fillna(0).cumsum()
        return obv

    def calculate_ad(self, df):
        """計算 累積/派發指標 (AD)"""
        mf_multiplier = ((df['Close'] - df['Low']) - (df['High'] - df['Close'])) / (df['High'] - df['Low'] + 1e-9)
        mf_volume = mf_multiplier * df['Volume']
        ad = mf_volume.cumsum()
        return ad

    def calculate_bias(self, df, n=20):
        """計算 乖離率 (Bias)"""
        ma = df['Close'].rolling(window=n).mean()
        bias = (df['Close'] - ma) / (ma + 1e-9) * 100
        return bias

    def evaluate_short_term(self, price_df, chip_df):
        last, prev = price_df.iloc[-1], price_df.iloc[-2]; trend_score = 0
        ma5, ma10, ma20 = last['MA5'], last['MA10'], last['MA20']
        if ma5 > ma10 > ma20: trend_score = config.TREND_SCORE_FULL
        elif last['Close'] > ma5 and ma5 > ma10: trend_score = config.TREND_SCORE_HALF
        elif last['Close'] > ma20: trend_score = config.TREND_SCORE_LOW
        vol_avg = price_df['Volume'].iloc[:-1].tail(5).mean(); vol_ratio = last['Volume'] / (vol_avg + 1e-9)
        momentum_score = config.MOMENTUM_SCORE_HIGH if vol_ratio > 2.0 and last['Close'] > prev['Close'] else config.MOMENTUM_SCORE_LOW if vol_ratio > 1.2 else 0
        chip_score = 0
        if not chip_df.empty and 'net_buy' in chip_df.columns:
            nb3 = chip_df.tail(3)['net_buy'].sum() / 1000
            chip_score = config.CHIP_SCORE_HIGH if nb3 > 500 else config.CHIP_SCORE_MID if nb3 > 100 else config.CHIP_SCORE_LOW if nb3 > 0 else 0
        total = trend_score + momentum_score + chip_score
        status = "強勢爆發" if total >= 80 else "波段看漲" if total >= 60 else "中性偏多" if total >= 40 else "整理中"
        return {"score": round(total, 1), "status": status, "vol_ratio": round(vol_ratio, 2)}

    def calculate_cdp(self, prev_df, intraday_snapshot=None):
        """
        CDP 逆勢操作系統 (Contrarian Differential Pulse)
        利用前一交易日的 H, L, C 計算當日的五個等級。
        """
        h, l, c = 0, 0, 0
        base_date = "未知"
        
        if intraday_snapshot and 'yesterday_high' in intraday_snapshot:
            h = intraday_snapshot['yesterday_high']
            l = intraday_snapshot['yesterday_low']
            c = intraday_snapshot['yesterday_close']
            base_date = intraday_snapshot.get('cdp_base_date', "未知")
        elif not prev_df.empty:
            df = prev_df.sort_index().groupby(level=0).last()
            now = datetime.now(pytz.timezone("Asia/Taipei"))
            market_close = now.replace(hour=13, minute=31, second=0, microsecond=0)
            
            # 找到最後一個交易日
            last_date = df.index[-1].date()
            if last_date == now.date():
                # 如果最後一筆是今天，且現在還沒收盤，則 CDP 基準應為昨天
                if now < market_close:
                    target = df.iloc[-2] if len(df) >= 2 else df.iloc[-1]
                else:
                    # 如果已經收盤，則可以用今天的數據來預覽隔日的 CDP
                    target = df.iloc[-1]
            else:
                # 最後一筆不是今天，直接用最後一筆
                target = df.iloc[-1]
                
            h, l, c = float(target['High']), float(target['Low']), float(target['Close'])
            base_date = target.name.strftime("%Y-%m-%d")
        else:
            return {}

        cdp = (h + l + 2 * c) / 4
        dist = h - l
        ah = cdp + dist
        nh = 2 * cdp - l
        nl = 2 * cdp - h
        al = cdp - dist
        
        # 決定是否為預覽模式 (基準日是否為今天)
        now = datetime.now(pytz.timezone("Asia/Taipei"))
        is_preview = (base_date == now.strftime("%Y-%m-%d"))
        
        res = {
            "CDP": round(cdp, 2),
            "AH": round(ah, 2),
            "NH": round(nh, 2),
            "NL": round(nl, 2),
            "AL": round(al, 2),
            "base_date": base_date,
            "is_preview": is_preview,
            "signals": []
        }
        
        if intraday_snapshot:
            price = intraday_snapshot.get('price')
            open_p = intraday_snapshot.get('open')
            
            # 只有在收盤前 (或是 CDP 基準日為昨天的情況下) 才計算即時診斷訊號
            # 避免「用今天的開盤價」去診斷「明天的 CDP」
            now = datetime.now(pytz.timezone("Asia/Taipei"))
            market_close = now.replace(hour=13, minute=31, second=0, microsecond=0)
            
            if now < market_close:
                # 1. 強弱分水嶺 (CDP)
                if open_p:
                    if open_p > cdp: res["signals"].append(f"開盤 > CDP ({open_p} > {res['CDP']})，偏多")
                    else: res["signals"].append(f"開盤 < CDP ({open_p} < {res['CDP']})，偏空")

                # 2. 順勢操作 (跳空突破/跌破)
                if open_p:
                    if open_p >= ah: res["signals"].append("開盤突破 AH，動能強勁可追漲")
                    elif open_p <= al: res["signals"].append("開盤跌破 AL，盤勢弱順勢偏空")

                # 3. 逆勢操作與壓力支撐
                if price:
                    if price >= ah: res["signals"].append("觸及 AH，考慮獲利了結")
                    elif price >= nh: res["signals"].append("突破 NH，短線賣點")
                    
                    if price <= al: res["signals"].append("觸及 AL，考慮低接佈局")
                    elif price <= nl: res["signals"].append("跌破 NL，短線買點")
            else:
                # 盤後時間，CDP 已轉為「明日預覽」
                res["is_preview"] = True
        
        return res

    def evaluate_volume_patterns(self, price_df):
        """
        成交量六大核心形態：高量、低量、平量、倍量、縮量、梯量
        """
        if len(price_df) < 5:
            return [{"pattern": "數據不足", "desc": "無法判斷量能形態", "status": "neutral"}]
        
        last = price_df.iloc[-1]
        vol = last['Volume']
        close = last['Close']
        
        # Calculate 3-day average volume for recent reference
        vols = price_df['Volume'].iloc[-4:-1]
        avg_vol_3 = vols.mean() if len(vols) >= 3 else vol
        
        # Calculate position context (high vs low)
        recent_high_20 = price_df['High'].iloc[-21:-1].max()
        recent_low_20 = price_df['Low'].iloc[-21:-1].min()
        
        is_high_pos = close > recent_high_20 * 0.95
        is_low_pos = close < recent_low_20 * 1.05
        
        patterns = []
        
        # 4. 倍量柱 (優先判斷，因為是最強勢的攻擊訊號)
        prev_vol = price_df['Volume'].iloc[-2]
        if vol > prev_vol * 1.9: # 接近或大於兩倍
            patterns.append({"pattern": "倍量柱", "desc": "主力真金白銀進攻信號", "status": "positive"})
            
        # 1. 高量柱 (若不是倍量，但也大於均量 50%)
        elif vol > avg_vol_3 * 1.5:
            if is_low_pos:
                patterns.append({"pattern": "高量柱 (低位)", "desc": "主力可能在低位吸籌", "status": "positive"})
            elif is_high_pos:
                patterns.append({"pattern": "高量柱 (高位)", "desc": "高位爆量，提防主力出貨", "status": "negative"})
            else:
                patterns.append({"pattern": "高量柱", "desc": "資金活躍的信號", "status": "positive"})
                
        # 2. 低量柱 (五日內最低，且只有均量一半)
        recent_vols_5 = price_df['Volume'].iloc[-5:]
        if vol == recent_vols_5.min() and vol < price_df['Volume'].iloc[-10:-1].mean() * 0.6:
            desc = "賣盤枯竭，變盤前夕" if is_low_pos else "買盤縮手觀望"
            patterns.append({"pattern": "低量柱", "desc": desc, "status": "positive" if is_low_pos else "neutral"})
            
        # 3. 平量柱 (近三天變異數極低)
        recent_vols_3 = price_df['Volume'].iloc[-3:]
        if len(recent_vols_3) == 3 and (recent_vols_3.std() / recent_vols_3.mean()) < 0.15:
            patterns.append({"pattern": "平量柱", "desc": "多空勢均力敵", "status": "neutral"})
            
        # 5. 縮量柱 (連三天遞減)
        if len(price_df) >= 3:
            v1, v2, v3 = price_df['Volume'].iloc[-3], price_df['Volume'].iloc[-2], price_df['Volume'].iloc[-1]
            if v1 > v2 > v3:
                if is_low_pos:
                    patterns.append({"pattern": "縮量柱 (下跌中)", "desc": "拋盤減少，見底信號", "status": "positive"})
                elif price_df['MA5'].iloc[-1] < close:
                    patterns.append({"pattern": "縮量柱 (回調中)", "desc": "主力洗盤，耐心持有", "status": "positive"})
                    
        # 6. 梯量柱 (連三天遞增)
        if len(price_df) >= 3:
            v1, v2, v3 = price_df['Volume'].iloc[-3], price_df['Volume'].iloc[-2], price_df['Volume'].iloc[-1]
            if v1 < v2 < v3:
                if is_low_pos:
                    patterns.append({"pattern": "梯量柱 (啟動)", "desc": "量價齊升，資金穩步進場", "status": "positive"})
                elif is_high_pos and close <= price_df['Close'].iloc[-2] * 1.01:
                    patterns.append({"pattern": "梯量柱 (高位滯漲)", "desc": "放量滯漲，主力邊拉邊撤", "status": "negative"})

        if not patterns:
            patterns.append({"pattern": "一般量能", "desc": "無明顯量價異常", "status": "neutral"})
            
        return patterns

    def evaluate_short_term_recommendation(self, price_df, chip_df, intraday_snapshot=None):
        score = 0; signals = []; last = price_df.iloc[-1]; close = last['Close']
        if close > config.MAX_STOCK_PRICE_FOR_ST_REC: return {"score": 0, "status": "不符條件", "signals": [f"價格超過{config.MAX_STOCK_PRICE_FOR_ST_REC}元"], "strategy": "不建議"}
        
        vol_avg = price_df['Volume'].iloc[:-1].tail(5).mean(); vol_ratio = last['Volume'] / (vol_avg + 1e-9)
        atr_pct = (last['atr'] / close) * 100 # ATR 佔比反映波動度
        
        # 0. 基礎趨勢加分
        ma5, ma10, ma20 = last['MA5'], last['MA10'], last['MA20']
        if close > ma5 > ma10:
            score += 15; signals.append("均線多頭排列")
        elif close > ma5:
            score += 5; signals.append("站上5日線")

        # 1. 交易量與動能
        if last['Volume'] >= 1000000: # 至少 1000 張 (原 2000 張)
            score += 15; signals.append("流動性充裕")
        if vol_ratio > 1.3:
            score += 20; signals.append(f"量能增溫 (量比 {round(vol_ratio, 1)})")
        
        # 2. 波動幅度
        if atr_pct > 2.5: # 原 3.0
            score += 10; signals.append(f"具備波動性")
        
        # 3. 技術面訊號
        # 均線回踩
        if last['Low'] <= ma5 * 1.015 and close > ma5:
            score += 15; signals.append("均線回踩支撐")
        # 突破交易
        recent_high_20 = price_df['High'].iloc[:-1].tail(20).max()
        if close > recent_high_20:
            score += 20; signals.append("突破盤整區間")
        
        # 4. 指標配合
        if last['RSI'] > 50 and last['RSI'] < 80:
            score += 10; signals.append("RSI 強勢區")
        
        # 籌碼輔助
        if not chip_df.empty and chip_df['net_buy'].tail(3).sum() > 0:
            score += 10; signals.append("法人少量佈局")
        
        # 停損與進場建議
        strategy = "強勢突破追價" if close > recent_high_20 else "回檔支撐買入"
        stop_loss = round(min(last['Low'], close * 0.96), 2)
        
        # 5. 成交量六大形態加成
        vol_patterns = self.evaluate_volume_patterns(price_df)
        for vp in vol_patterns:
            if vp['pattern'] == "倍量柱":
                score += 15; signals.append("倍量柱強力表態")
            elif vp['pattern'] == "高量柱 (低位)":
                score += 10; signals.append("低位高量吸籌")
            elif vp['pattern'] == "高量柱 (高位)" or vp['pattern'] == "梯量柱 (高位滯漲)":
                score -= 20; signals.append(f"⚠️ 短線風險: {vp['pattern']}")
                
        status = "短線極佳" if score >= 70 else "具潛力" if score >= 45 else "觀察中"
        
        return {
            "score": max(0, score),
            "status": status,
            "signals": signals,
            "vol_ratio": round(vol_ratio, 2),
            "strategy": strategy,
            "stop_loss": stop_loss,
            "bias_ma5": round((close - ma5) / (ma5 + 1e-9), 3)
        }

    def evaluate_low_pe_strategy(self, price_df, chip_df, pe_val):
        score = 0; signals = []
        try: pe = float(pe_val)
        except: return {"score": 0, "status": "無PE數據", "signals": [], "is_low_pe": False}
        is_low_pe = pe <= config.LOW_PE_THRESHOLD
        if is_low_pe: score += 40; signals.append(f"本益比極低 ({pe})")
        elif pe <= 15: score += 20; signals.append(f"本益比偏低 ({pe})")
        last_price = price_df['Close'].iloc[-1]; last_vol = price_df['Volume'].iloc[-1]; ma5 = price_df['MA5'].iloc[-1]; ma20 = price_df['MA20'].iloc[-1]; vol_avg = price_df['Volume'].iloc[:-1].tail(5).mean(); vol_ratio = last_vol / (vol_avg + 1e-9); bias_ma5 = (last_price - ma5) / (ma5 + 1e-9)
        if last_price > ma5: score += 20; signals.append("站上5日線")
        if ma5 > ma20: score += 20; signals.append("短中期均線多頭")
        if bias_ma5 > config.MAX_BIAS_MA5:
            is_super_strong = vol_ratio > 1.8 or (not chip_df.empty and chip_df['net_buy'].tail(3).sum() > 300)
            if is_super_strong: score -= 10; signals.append("強勢起漲(乖離大)")
            else: score -= 30; signals.append("短線乖離過大")
        if not chip_df.empty and chip_df['net_buy'].tail(3).sum() > 0: score += 20; signals.append("法人近期買進")
        if score >= 80: status = "價值噴發股" if bias_ma5 > config.MAX_BIAS_MA5 else "精選低PE價值股"
        elif score >= 60: status = "強勢價值股" if bias_ma5 > config.MAX_BIAS_MA5 else "潛力價值股"
        else: status = "價值股回檔中" if bias_ma5 > config.MAX_BIAS_MA5 else "價值觀察"
        return {"score": max(0, score), "status": status, "signals": signals, "is_low_pe": is_low_pe, "pe": pe, "bias_ma5": round(bias_ma5, 3)}

    def evaluate_etf(self, price_df):
        score = 0; signals = []; last = price_df.iloc[-1]; ma20, ma60 = last['MA20'], last['MA60']
        if last['Close'] > ma20 > ma60: score += 40; signals.append("趨勢多頭")
        if last['MACD_Hist'] > 0: score += 30; signals.append("MACD多方")
        status = "適合進場" if score >= 60 else "中性佈局" if score >= 40 else "觀望"
        return {"score": score, "status": status, "signals": signals}

    def evaluate_overnight_momentum(self, price_df, intraday_data):
        if not intraday_data: return {"score": 0, "status": "無數據", "signals": []}
        prev_close = intraday_data['yesterday_close']; curr_price = intraday_data['price']; change_pct = ((curr_price - prev_close) / prev_close) * 100
        stock_id = intraday_data.get('stock_id', ""); score = 0; signals = []
        
        # 1. 基礎流動性過濾: 成交量不可低於 3000 張 (3,000,000 股)
        curr_vol = price_df['Volume'].iloc[-1]
        if curr_vol < 3000000:
            return {"score": 0, "status": "流動性不足", "signals": ["成交量低於 3000 張"]}
        
        # 2. 動能與漲幅 (極度強勢)
        if change_pct >= 9.7:
            score += 50; signals.append("🔥 強勢鎖漲停 (極高溢價)")
        elif change_pct >= 8.0:
            score += 35; signals.append("🚀 準備鎖板(8%以上)")
        elif change_pct >= 5.0:
            score += 20; signals.append("強勢領漲(5-8%)")
        else:
            score += 5; signals.append("動能一般")
            
        # 3. 技術面與趨勢位階 (上方無重壓)
        recent_high_20 = price_df['High'].iloc[:-1].tail(20).max()
        recent_high_60 = price_df['High'].iloc[:-1].tail(60).max()
        if curr_price > recent_high_60: 
            score += 20; signals.append("突破季線高點(無重壓)")
        elif curr_price > recent_high_20: 
            score += 10; signals.append("突破月線高點")
            
        # 均線多頭排列加分
        last_row = price_df.iloc[-1]
        if last_row['Close'] > last_row.get('MA5', 0) > last_row.get('MA10', 0) > last_row.get('MA20', 0):
            score += 15; signals.append("均線完美多頭排列")
            
        # 4. 盤中即時狀態與進場時機
        high = intraday_data['high']
        if curr_price >= high * 0.992: 
            score += 10; signals.append("收最高/維持高檔")
            
        from datetime import datetime
        import pytz
        now = datetime.now(pytz.timezone("Asia/Taipei"))
        is_market_hours = (9 <= now.hour < 13) or (now.hour == 13 and now.minute <= 30)
        is_golden_time = (now.hour == 13 and 0 <= now.minute <= 25)
        if is_market_hours and is_golden_time:
            score += 10; signals.append("⏳ 尾盤黃金進場時機 (13:00-13:25)")
            
        # 5. 籌碼輔助與隔日沖主力陷阱偵測
        broker_data = self.fetcher.get_broker_trades(stock_id); ratio = 0; broker_list = []
        dangerous_brokers = ["凱基-台北", "元大-土城永寧", "富邦-建國", "凱基-松山", "美林", "摩根大通"]
        is_trap = False
        
        if broker_data and not broker_data.get('restricted'):
            ratio = broker_data['ratio']
            broker_list = broker_data.get('brokers', [])
            
            # 計算危險主力佔比
            danger_ratio = 0
            found_danger = []
            for b in broker_list:
                b_name = b.get('name', '')
                if any(db in b_name for db in dangerous_brokers):
                    danger_ratio += b.get('ratio', 0) # Assuming ratio exists, else we rely on max_single_ratio
                    found_danger.append(b_name)
                    
            max_single_ratio = broker_data.get('max_single_broker_ratio', 0)
            
            if found_danger:
                signals.append(f"⚠️ 發現知名隔日沖主力: {', '.join(found_danger)}")
                
            if ratio >= 15 or max_single_ratio >= 15:
                is_trap = True
                score -= 40
                max_r = max_single_ratio if max_single_ratio > 15 else ratio
                signals.append(f"🛑 嚴重警告: 隔日沖籌碼極度集中 ({round(max_r, 1)}%)，小心早盤大舉倒貨！")
            elif ratio >= 10:
                score -= 10
                signals.append(f"⚠️ 警惕: 籌碼有集中倒貨風險 ({round(ratio, 1)}%)")
            else:
                score += 10
                signals.append("籌碼健康 (未見過度集中)")
        else:
            chip_df = self.fetcher.get_chip_data(stock_id, days=1)
            if not chip_df.empty and chip_df['net_buy'].iloc[-1] > 0:
                score += 10; signals.append("法人買進支撐")
                
        # 6. 成交量形態檢核
        vol_patterns = self.evaluate_volume_patterns(price_df)
        for vp in vol_patterns:
            if vp['pattern'] in ["高量柱 (高位)", "梯量柱 (高位滯漲)"]:
                if is_trap:
                    score -= 20; signals.append(f"🔴 極度危險: {vp['pattern']} 且籌碼集中")
                else:
                    score -= 5; signals.append(f"量能風險: {vp['pattern']}")
                    
        # 7. 狀態判定
        if is_trap:
            status = "⚠️ 隔日沖主力出貨警戒"
            score = min(score, 40)
        elif change_pct >= 9.7 and score >= 80:
            status = "⭐ 極度強勢 (尾盤首選)"
        elif score >= 60:
            status = "強勢隔日沖"
        else:
            status = "一般"
            
        return {"score": max(0, score), "status": status, "signals": signals}

    def evaluate_bottom_fishing(self, price_df, chip_df, pe_val):
        """
        抄底推薦策略 (專業修正版)
        1. 極度超跌：季線乖離 < -8% 或 價格處於 L60 最低點區間。
        2. 技術背離/超賣：RSI < 30 或 KD 低檔金叉。
        3. 止跌訊號：出現長下影、鎚頭線或吞噬紅K。
        4. 量能判定：成交量縮至 5日均量 60% 以下(窒息量) 或 底部放量突破。
        """
        score = 0; signals = []; last = price_df.iloc[-1]; prev = price_df.iloc[-2]
        close, open_p, high, low = last['Close'], last['Open'], last['High'], last['Low']
        ma20, ma60 = last['MA20'], last['MA60']
        
        # 1. 均線乖離與位階 (權重最高)
        bias_ma60 = (close - ma60) / (ma60 + 1e-9)
        if bias_ma60 <= -0.10:
            score += 35; signals.append(f"極度超跌 (季線乖離 {round(bias_ma60*100, 1)}%)")
        elif bias_ma60 <= -0.06:
            score += 20; signals.append(f"波段超跌 (季線乖離 {round(bias_ma60*100, 1)}%)")
        
        recent_low_60 = price_df['Low'].iloc[:-1].tail(60).min()
        if low <= recent_low_60 * 1.01:
            score += 20; signals.append("歷史低價區 (近60日低點)")

        # 2. 超賣指標判定
        rsi = last.get('RSI', 50)
        if rsi < 25:
            score += 25; signals.append(f"指標極度超賣 (RSI={round(rsi, 1)})")
        elif rsi < 35:
            score += 15; signals.append(f"進入超賣區 (RSI={round(rsi, 1)})")
            
        k, d = last.get('K', 50), last.get('D', 50)
        if k < 20 and d < 20:
            if k > d: # 低檔金叉
                score += 25; signals.append("KD低檔金叉 (強烈止跌訊號)")
            else:
                score += 10; signals.append("KD低檔超賣")

        # 3. K 線止跌型態
        body = abs(close - open_p)
        lower_shadow = min(close, open_p) - low
        upper_shadow = high - max(close, open_p)
        
        # 鎚頭線/長下影
        if lower_shadow > body * 2.0 and lower_shadow > upper_shadow:
            score += 25; signals.append("出現止跌鎚頭線")
        # 陽包陰 (吞噬)
        elif close > prev['Open'] and open_p < prev['Close'] and prev['Close'] < prev['Open']:
            score += 20; signals.append("多方吞噬 (陽包陰)")
        elif close > open_p and body > (abs(prev['Close'] - prev['Open']) * 1.2):
            score += 10; signals.append("低檔轉折紅K")

        # 4. 量能與轉強確認
        vol_avg_5 = price_df['Volume'].iloc[:-1].tail(5).mean()
        curr_vol = last['Volume']
        if curr_vol < vol_avg_5 * 0.5:
            score += 15; signals.append("出現底部窒息量")
        elif curr_vol > vol_avg_5 * 1.8 and close > open_p:
            score += 20; signals.append("底部爆量攻擊 (換手轉強)")

        # 5. 法人動向
        if not chip_df.empty:
            net_buy_3d = chip_df['net_buy'].tail(3).sum()
            if net_buy_3d > 100000: # 100張以上
                score += 10; signals.append("法人低檔佈局")

        # 狀態判定
        if score >= 75: status = "抄底絕佳標的"
        elif score >= 55: status = "初步止跌跡象"
        elif score >= 40: status = "尋找支撐中"
        else: status = "仍處跌勢"
        
        # 專業停損建議：以近期最低點下 2% 或 乖離過大處
        stop_loss = round(min(low, close * 0.95), 2)
        
        return {
            "score": max(0, score),
            "status": status,
            "signals": signals,
            "stop_loss": stop_loss,
            "bias_ma60": round(bias_ma60, 3)
        }

    def evaluate_short_term_burst(self, price_df, chip_df):
        """
        短線衝刺策略 (Short-term Burst Strategy)
        1. 動能與流動性：成交量 > 5日均量且具備基本流動性。
        2. 進場訊號：均線回踩 (MA5/MA10) 或 強勢突破 (破箱頂)。
        3. 技術指標：RSI > 50 且轉折向上，KD 黃金交叉或強勢區間。
        4. K 線型態：陽包陰、長下影線。
        """
        score = 0; signals = []; last = price_df.iloc[-1]; prev = price_df.iloc[-2]
        close, open_p, high, low = last['Close'], last['Open'], last['High'], last['Low']
        p_close, p_open = prev['Close'], prev['Open']
        ma5, ma10, ma20 = last['MA5'], last['MA10'], last['MA20']
        vol_avg_5 = price_df['Volume'].iloc[:-1].tail(5).mean()
        vol_ratio = last['Volume'] / (vol_avg_5 + 1e-9)

        # 1. 流動性與動能
        if last['Volume'] >= 2000000: # 至少 2000 張
            score += 15; signals.append("流動性佳")
        if vol_ratio > 1.3:
            score += 15; signals.append(f"量增 (量比 {round(vol_ratio, 2)})")

        # 2. 趨勢判斷
        if close > ma5 > ma10:
            score += 20; signals.append("多頭排列")
        
        # 策略 A: 均線回踩
        if low <= ma5 * 1.01 and close > ma5:
            score += 20; signals.append("回踩 5 日線 (支撐確認)")
        elif low <= ma10 * 1.01 and close > ma10:
            score += 15; signals.append("回踩 10 日線")

        # 策略 B: 突破交易
        recent_high_20 = price_df['High'].iloc[:-1].tail(20).max()
        if close > recent_high_20 and vol_ratio > 1.5:
            score += 25; signals.append("強勢突破前高")

        # 3. K 線型態
        # 陽包陰
        if p_close < p_open and close > p_open and open_p < p_close:
            score += 20; signals.append("型態：陽包陰")
        # 長下影線
        body = abs(close - open_p)
        lower_shadow = min(close, open_p) - low
        if lower_shadow > body * 1.8 and close > open_p:
            score += 15; signals.append("型態：長下影線")

        # 4. 指標訊號
        if last['RSI'] > 50 and last['RSI'] > price_df['RSI'].iloc[-2]:
            score += 15; signals.append("RSI 轉折向上")
        if last['K'] > last['D'] and price_df['K'].iloc[-2] <= price_df['D'].iloc[-2]:
            score += 15; signals.append("KD 金叉")

        # 5. 籌碼輔助
        if not chip_df.empty and chip_df['net_buy'].tail(3).sum() > 200:
            score += 10; signals.append("法人布局")

        status = "短線強烈推薦" if score >= 65 else "短線動能增強" if score >= 45 else "動能整理中"
        
        # 停損點：跌破今日低點或 3%
        stop_loss = round(min(low, close * 0.97), 2)
        take_profit = round(close * 1.07, 2) # 短線目標 7%
        
        return {
            "score": max(0, score),
            "status": status,
            "signals": signals,
            "stop_loss": stop_loss,
            "take_profit": take_profit,
            "vol_ratio": round(vol_ratio, 2)
        }

    def evaluate_day_trade_cdp(self, price_df, is_limit_up, is_limit_down, cdp_data):
        """
        當沖 CDP 偵測
        核心關鍵：尋找「股價波動大、成交量活絡、且前一日有明顯高低點但未出現連續漲跌停」的個股。
        """
        if len(price_df) < 6:
            return {"score": 0, "status": "資料不足", "signals": [], "is_valid": False}
        
        last = price_df.iloc[-1]
        prev = price_df.iloc[-2]
        
        vol_avg_5 = price_df['Volume'].iloc[:-1].tail(5).mean()
        curr_vol = last['Volume']
        
        prev_high = prev['High']
        prev_low = prev['Low']
        prev_open = prev['Open']
        
        score = 0
        signals = []
        
        # 條件 1: 前一日波幅適中 (3% ~ 8%)
        amplitude = 0
        if prev_open > 0:
            amplitude = (prev_high - prev_low) / prev_open
            
        if 0.03 <= amplitude <= 0.08:
            score += 30
            signals.append(f"前日波幅 {round(amplitude*100, 1)}% (符合當沖)")
        elif amplitude > 0.08:
            score += 15
            signals.append(f"前日波幅 {round(amplitude*100, 1)}% (波動劇烈)")
        else:
            # 波動太小不適合
            return {"score": 0, "status": "波幅過小", "signals": [], "is_valid": False}
            
        # 條件 2: 成交量活絡 (> 2000張)
        if vol_avg_5 > 2000 and curr_vol > 2000:
            score += 30
            signals.append("流動性佳")
        else:
            return {"score": 0, "status": "流動性不足", "signals": [], "is_valid": False}
            
        # 條件 3: 排除漲跌停鎖死 (股性活潑但非極端)
        if is_limit_up or is_limit_down:
            return {"score": 0, "status": "漲跌停鎖死", "signals": [], "is_valid": False}
        else:
            score += 20
            
        # 條件 4: CDP 價位建議
        if cdp_data and cdp_data.get('CDP'):
            score += 20
            
        status = "適合當沖" if score >= 80 else "波段觀察"
        
        return {
            "score": score,
            "status": status,
            "signals": signals,
            "is_valid": score >= 80,
            "amplitude": round(amplitude*100, 2)
        }

    def calculate_atr(self, df, n=14):
        high = df['High']; low = df['Low']; close_prev = df['Close'].shift(1)
        tr = pd.concat([high - low, abs(high - close_prev), abs(low - close_prev)], axis=1).max(axis=1)
        return tr.rolling(window=n).mean()

    def classify_category(self, stock_id, stock_name, industry, volume_rank):
        """五大分類邏輯 (台股版)"""
        # 1. AI/半導體
        if any(keyword in industry for keyword in ["半導體", "電子零組件", "電腦及週邊"]):
            if any(keyword in stock_name for keyword in ["台積電", "聯發科", "廣達", "緯創", "鴻海"]):
                return "AI/半導體 (核心龍頭)"
            return "AI/半導體 (供應鏈)"
        
        # 2. 高人氣龍頭股
        if volume_rank <= 20:
            return "高人氣龍頭股"
        
        # 3. 加密貨幣概念股 (台股相關：如顯卡、挖礦概念)
        if any(keyword in stock_name for keyword in ["撼訊", "麗臺", "微星", "技嘉"]):
            return "加密貨幣相關 (硬體/顯卡)"
            
        # 4. 事件驅動股 (需結合新聞/財報，此處以近期量能激增代用)
        # 5. 高波動題材股 (由分析結果中的 volatility 決定)
        return "一般熱門股"

    def analyze(self, stock_id: str, intraday_snapshot=None):
        is_etf = self.fetcher.is_etf(stock_id)
        import concurrent.futures
        with concurrent.futures.ThreadPoolExecutor(max_workers=5) as executor:
            future_intraday = executor.submit(self.fetcher.get_intraday_data, stock_id) if intraday_snapshot is None else None
            future_price = executor.submit(self.fetcher.get_price_data, stock_id, 250)
            future_chip = executor.submit(self.fetcher.get_chip_data, stock_id, 10) if not is_etf else None
            future_margin = executor.submit(self.fetcher.get_margin_data, stock_id, 5) if not is_etf else None
            future_vol = executor.submit(self.fetcher.get_stock_volatility, stock_id)
            
            if future_intraday:
                intraday_snapshot = future_intraday.result()
            df_raw = future_price.result()
            self._chip_df_cache = future_chip.result() if future_chip else pd.DataFrame()
            self._margin_df_cache = future_margin.result() if future_margin else pd.DataFrame()
            self._vol_info_cache = future_vol.result()

        if df_raw.empty or len(df_raw) < 35: return {"error": "數據不足"}
        price_df = df_raw.copy(); stock_name = self.fetcher._stock_id_map.get(str(stock_id), "未知")
        
        # 修正：如果還是沒有名稱，或是名稱就是代碼本身，嘗試從 yfinance 抓取
        # 修正：如果還是沒有名稱，或是名稱就是代碼本身 (全數字)，嘗試從 yfinance 抓取
        if stock_name in ["未知", stock_id, str(stock_id)] or stock_name.isdigit():
            try:
                symbols = []
                sym_map_val = self.fetcher.get_symbol_map().get(stock_id)
                if sym_map_val: symbols.append(sym_map_val)
                symbols.extend([f"{stock_id}.TW", f"{stock_id}.TWO"])
                
                for symbol in symbols:
                    t = yf.Ticker(symbol)
                    yf_name = t.info.get('shortName') or t.info.get('longName')
                    if yf_name:
                        stock_name = str(yf_name).replace(" ", "")
                        self.fetcher._stock_id_map[stock_id] = stock_name
                        self.fetcher._stock_name_map[stock_name] = stock_id
                        break
            except: pass
        
        # 合併最新數據至歷史 DataFrame
        latest_history_date = price_df.index[-1].date()
        merged_new_data = False
        
        # 1. 優先從 intraday_snapshot 獲取 (即時性最高)
        if intraday_snapshot and 'price' in intraday_snapshot:
            # 決定日期
            if 'df_1m' in intraday_snapshot and not intraday_snapshot['df_1m'].empty:
                snap_date = intraday_snapshot['df_1m'].index[-1].date()
            else:
                snap_date = datetime.now(pytz.timezone("Asia/Taipei")).date()

            if snap_date >= latest_history_date:
                new_row = {
                    'Open': intraday_snapshot.get('open', intraday_snapshot['price']),
                    'High': intraday_snapshot.get('high', intraday_snapshot['price']),
                    'Low': intraday_snapshot.get('low', intraday_snapshot['price']),
                    'Close': intraday_snapshot['price'],
                    'Volume': intraday_snapshot.get('volume', price_df['Volume'].iloc[-1]) 
                }
                new_dt = pd.to_datetime(snap_date)
                if snap_date == latest_history_date:
                    # 只有在 snap_date 確實有新數據或 yfinance 歷史數據明顯落後時才覆蓋
                    # 通常 intraday_snapshot 較新
                    price_df.loc[price_df.index[-1]] = new_row
                else:
                    new_df = pd.DataFrame([new_row], index=[new_dt])
                    price_df = pd.concat([price_df, new_df])
                merged_new_data = True

        # 2. 如果沒合併過，或者官方數據日期比 snapshot 還新，則嘗試從 official_cache 獲取 (收盤後最準)
        if stock_id in self.fetcher._official_cache:
            off = self.fetcher._official_cache[stock_id]
            if 'date' in off and 'price' in off:
                off_date = datetime.strptime(off['date'], "%Y-%m-%d").date()

                # 判定是否要覆蓋/新增官方數據
                # 條件：比目前歷史最新，或跟 snapshot 同一天但官方數據通常更準(收盤後)
                if off_date >= latest_history_date:
                    new_row = {
                        'Open': off.get('open', off['price']),
                        'High': off.get('high', off['price']),
                        'Low': off.get('low', off['price']),
                        'Close': off['price'],
                        'Volume': off.get('volume', 0) * 1000 # 張轉股
                    }
                    new_dt = pd.to_datetime(off_date)

                    if off_date == price_df.index[-1].date():
                        # 同一天的數據，優先採用官方數據 (OpenAPI)，除非 snapshot 是盤中且官方數據還沒更新
                        # 但這裡 official_cache 通常是 sync_if_needed 更新的最新狀態
                        price_df.loc[price_df.index[-1]] = new_row
                    elif off_date > price_df.index[-1].date():
                        new_df = pd.DataFrame([new_row], index=[new_dt])
                        price_df = pd.concat([price_df, new_df])
                    merged_new_data = True
        # 基礎均線
        price_df.loc[:, 'MA5'] = price_df['Close'].rolling(window=5).mean()
        price_df.loc[:, 'MA10'] = price_df['Close'].rolling(window=10).mean()
        price_df.loc[:, 'MA20'] = price_df['Close'].rolling(window=20).mean()
        price_df.loc[:, 'MA60'] = price_df['Close'].rolling(window=60).mean()
        price_df.loc[:, 'MA120'] = price_df['Close'].rolling(window=120).mean()
        price_df.loc[:, 'MA240'] = price_df['Close'].rolling(window=240).mean()
        
        # 進階指標
        plus_di, minus_di, adx = self.calculate_dmi(price_df)
        price_df.loc[:, 'plus_di'] = plus_di; price_df.loc[:, 'minus_di'] = minus_di; price_df.loc[:, 'adx'] = adx
        price_df.loc[:, 'obv'] = self.calculate_obv(price_df)
        price_df.loc[:, 'ad_line'] = self.calculate_ad(price_df)
        price_df.loc[:, 'bias_20'] = self.calculate_bias(price_df, n=20)
        price_df.loc[:, 'atr'] = self.calculate_atr(price_df)
        
        upper, middle, lower = self.calculate_bollinger_bands(price_df)
        price_df.loc[:, 'BB_Upper'] = upper; price_df.loc[:, 'BB_Middle'] = middle; price_df.loc[:, 'BB_Lower'] = lower
        k, d = self.calculate_kd(price_df); price_df.loc[:, 'K'] = k; price_df.loc[:, 'D'] = d; price_df.loc[:, 'RSI'] = self.calculate_rsi(price_df)
        dif, dea, macd = self.calculate_macd(price_df)
        price_df.loc[:, 'MACD_Hist'] = macd
        price_df.loc[:, 'MACD_Line'] = dif
        price_df.loc[:, 'MACD_Signal'] = dea
        
        vol_patterns = self.evaluate_volume_patterns(price_df)
        
        last, prev = price_df.iloc[-1], price_df.iloc[-2]
        chip_df = getattr(self, '_chip_df_cache', pd.DataFrame())
        margin_df = getattr(self, '_margin_df_cache', pd.DataFrame())
        vol_info = getattr(self, '_vol_info_cache', {'volatility': 0, 'atr': 0})
        
        # 獲取基礎面與分類
        official = self.fetcher._official_cache.get(stock_id, {})
        industry = "未知"
        if self.fetcher._stock_info_df is not None:
            row = self.fetcher._stock_info_df[self.fetcher._stock_info_df['stock_id'] == str(stock_id)]
            if not row.empty:
                col = 'industry' if 'industry' in self.fetcher._stock_info_df.columns else 'industry_category'
                industry = str(row[col].iloc[0])
        
        # 計算波動率與分類
        category = self.classify_category(stock_id, stock_name, industry, 50) # 簡化 volume rank
        if vol_info['volatility'] > 40: category = "高波動題材股"

        st_res = self.evaluate_short_term(price_df, chip_df)
        diag = []; diag.extend(self.evaluate_moving_averages(price_df)); lvl = self.identify_price_levels(price_df); diag.extend(lvl["diag"]); diag.extend(self.identify_k_patterns(price_df)); diag.extend(self.identify_macd_details(price_df)); diag.extend(self.identify_bollinger_details(price_df))
        
        # 趨勢強度診斷 (DMI/ADX)
        if last['adx'] > 25:
            trend_dir = "多方" if last['plus_di'] > last['minus_di'] else "空方"
            diag.append(f"趨勢確認：目前處於強勢{trend_dir}趨勢 (ADX={round(last['adx'],1)})。")
        elif last['adx'] < 20:
            diag.append(f"盤整特徵：目前趨勢不明確，建議區間操作 (ADX={round(last['adx'],1)})。")
            
        # 價量與資金流診斷 (OBV/AD)
        obv_slope = (price_df['obv'].iloc[-1] - price_df['obv'].iloc[-5]) / 5
        if obv_slope > 0 and last['Close'] > prev['Close']:
            diag.append("價漲量增：OBV 指標同步向上，買盤支持強勁。")
        elif last['Close'] > prev['Close'] and obv_slope <= 0:
            diag.append("價漲量縮：警惕虛假突破，OBV 未同步走高。")
            
        # 乖離率與 ATR 診斷
        bias_20 = last['bias_20']
        if bias_20 > 5: diag.append(f"乖離偏高：20日乖離 {round(bias_20,1)}%，防回檔。")
        elif bias_20 < -5: diag.append(f"超跌訊號：20日乖離 {round(bias_20,1)}%，醞釀反彈。")
        
        # 長期投資診斷
        if not pd.isna(last['MA240']):
            if last['Close'] > last['MA240']: diag.append("長期趨勢看多 (站上年線)。")
            else: diag.append("長期趨勢偏弱 (年線之下)。")
        
        # 基本面加註
        if official.get('roe', 0) > 15: diag.append(f"高獲利能力：ROE達 {official['roe']}%。")
        if official.get('debt_ratio', 100) < 40: diag.append("財務穩健：負債比低於 40%。")

        low_pe_res = self.evaluate_low_pe_strategy(price_df, chip_df, official.get("pe"))
        bottom_fishing_res = self.evaluate_bottom_fishing(price_df, chip_df, official.get("pe"))
        st_burst_res = self.evaluate_short_term_burst(price_df, chip_df)
        cdp_res = self.calculate_cdp(price_df, intraday_snapshot)
        
        change_pct = round(((last['Close']-prev['Close'])/(prev['Close']+1e-9))*100, 2)
        is_limit_up = change_pct >= 9.7
        is_limit_down = change_pct <= -9.7
        
        day_trade_cdp_res = self.evaluate_day_trade_cdp(price_df, is_limit_up, is_limit_down, cdp_res)
        
        # 新增開盤檢核表
        opening_checklist = self.evaluate_opening_checklist(intraday_snapshot)
        if opening_checklist:
            if opening_checklist["score"] >= 40:
                diag.append(f"開盤檢核：{opening_checklist['status']} ({opening_checklist['score']}分)")
            if "觸發強制出場鐵律" in opening_checklist["signals"]:
                diag.append("!!! 警告：股價低於開盤價，請遵守紀律立刻出場 !!!")

        if bottom_fishing_res["score"] >= 50: diag.append(f"抄底訊號：{bottom_fishing_res['status']}")
        if st_burst_res["score"] >= 60: diag.append(f"短線爆發：{st_burst_res['status']}")
        if cdp_res.get("signals"): diag.extend(cdp_res["signals"])

        etf_rec = self.evaluate_etf(price_df) if is_etf else {"score":0, "status": "非ETF", "signals": []}
        strat_res = self.calculate_entry_strategy(price_df, chip_df, is_etf, intraday_snapshot)
        change_pct = round(((last['Close']-prev['Close'])/(prev['Close']+1e-9))*100, 2)
        
        # 準備圖表資料 (最近 60 筆)
        chart_data = []
        for index, row in price_df.tail(60).iterrows():
            chart_data.append({
                "time": index.strftime("%Y-%m-%d"),
                "date": index.strftime("%m-%d"),
                "open": round(float(row['Open']), 2) if not pd.isna(row['Open']) else 0,
                "high": round(float(row['High']), 2) if not pd.isna(row['High']) else 0,
                "low": round(float(row['Low']), 2) if not pd.isna(row['Low']) else 0,
                "close": round(float(row['Close']), 2) if not pd.isna(row['Close']) else 0,
                "volume": int(row['Volume'] / 1000) if row['Volume'] > 0 else 0,
                "macd_hist": round(float(row['MACD_Hist']), 3) if not pd.isna(row['MACD_Hist']) else 0,
                "macd_line": round(float(row['MACD_Line']), 3) if not pd.isna(row['MACD_Line']) else 0,
                "macd_signal": round(float(row['MACD_Signal']), 3) if not pd.isna(row['MACD_Signal']) else 0
            })
        
        return {
            "stock_id": stock_id, "stock_name": stock_name, "is_etf": is_etf, "category": category, "total_score": st_res["score"], 
            "price": round(last['Close'], 2), "yesterday_close": round(prev['Close'], 2), "change_percent": change_pct, "is_limit_up": change_pct >= 9.7, "vol_ratio": st_res["vol_ratio"],
            "kd": f"{round(last['K'],1)}/{round(last['D'],1)}", "rsi": round(last['RSI'], 1), "macd": f"{'多方' if macd.iloc[-1]>0 else '空方'}", "ma5": round(last['MA5'], 2), "ma20": round(last['MA20'], 2), "ma60": round(last['MA60'], 2), "ma120": round(last['MA120'], 2) if not pd.isna(last['MA120']) else None,
            "atr": round(last['atr'], 2), "volatility": vol_info['volatility'], "adx": round(last['adx'], 1), "bias_20": round(bias_20, 1),
            "net_buy_3d": int(chip_df.tail(3)['net_buy'].sum()/1000) if not chip_df.empty else 0, "recommend_status": st_res["status"], "diagnosis": diag, 
            "pe": official.get("pe", config.PE_RATIO_DEFAULT), "yield": official.get("yield", config.YIELD_DEFAULT), "roe": official.get("roe", 0), "debt_ratio": official.get("debt_ratio", 0),
            "entry_range": strat_res["entry_range"], "stop_loss": strat_res["stop_loss"], "take_profit": strat_res["take_profit"], "strategy_name": strat_res["strategy"],
            "overnight": self.evaluate_overnight_momentum(price_df, intraday_snapshot) if not is_etf else {"score":0, "status": "N/A", "signals": []},
            "short_term_rec": self.evaluate_short_term_recommendation(price_df, chip_df, intraday_snapshot) if not is_etf else {"score":0, "status": "N/A", "signals": []}, 
            "cdp": cdp_res,
            "day_trade_cdp_rec": day_trade_cdp_res,
            "low_pe_rec": low_pe_res,
            "bottom_fishing_rec": bottom_fishing_res, "short_term_burst_rec": st_burst_res, 
            "etf_rec": etf_rec,
            "opening_checklist": opening_checklist,
            "volume_patterns": vol_patterns,
            "entry_notes": self.generate_entry_notes(last, is_etf),
            "exit_rule": strat_res.get("exit_rule"),
            "chart_data": chart_data
        }

    def evaluate_opening_checklist(self, intraday_snapshot):
        """
        實作「股票進場標準與檢核表」
        """
        if not intraday_snapshot: return None
        
        res = {"score": 0, "signals": [], "status": "未達標", "details": []}
        
        open_p = intraday_snapshot.get('open')
        y_close = intraday_snapshot.get('yesterday_close')
        y_avg = intraday_snapshot.get('yesterday_avg')
        curr_price = intraday_snapshot.get('price')
        
        if not open_p or not y_close or not y_avg: return None
        
        # 第一階段：開盤 5 分鐘內的核心篩選
        # 動作一：檢視開盤位置
        pos_score = 0
        if open_p > y_avg > y_close:
            pos_score = 3
            res["details"].append("開盤位置：優先關注 (開 > 昨均 > 昨收) - 籌碼乾淨")
        elif open_p > y_close > y_avg:
            pos_score = 2
            res["details"].append("開盤位置：可看但不急 (開 > 昨收 > 昨均) - 有套牢賣壓")
        elif y_close < open_p < y_avg:
            pos_score = 1
            res["details"].append("開盤位置：猶豫區 (昨收 < 開 < 昨均) - 不在此做決定")
        else:
            pos_score = 0
            res["details"].append("開盤位置：放棄不出手 (開 < 昨均) - 潛在賣壓重")
        
        # 動作二：解讀第一根 5 分 K 線
        k_score = 0
        df_5m = intraday_snapshot.get('df_5m')
        if df_5m is not None and len(df_5m) > 0:
            first_5m = df_5m.iloc[0]
            entity = abs(first_5m['close'] - first_5m['open'])
            # 比較實體長度 (簡單判斷是否為長紅)
            if first_5m['close'] > first_5m['open'] and entity > (open_p * 0.005):
                k_score = 1
                res["details"].append("5分K：實在的紅K - 買盤紮實")
            elif first_5m['close'] > first_5m['open']:
                k_score = 0.5
                res["details"].append("5分K：微弱紅K - 買力一般")
            else:
                k_score = 0
                res["details"].append("5分K：黑K或收平 - 主力試單轉弱")
        
        # 動作三：評估成交量
        vol_score = 0
        df_1m = intraday_snapshot.get('df_1m')
        if df_1m is not None and len(df_1m) >= 5:
            vol_5m = df_1m['Volume'].head(5).sum()
            # 這裡需要一個基準量，假設為昨日前5分鐘量
            # 簡化判斷：如果前5分鐘量很大 (占昨日總量 5% 以上)
            y_vol = intraday_snapshot.get('volume', 1e9) # 這是張數，yf 1m 是股數
            if vol_5m > (y_vol * 1000 * 0.05):
                vol_score = 1
                res["details"].append("量能：攻擊量現蹤 - 成交量明顯放大")
            else:
                res["details"].append("量能：量縮或平淡 - 缺乏攻擊動能")

        # 總結第一階段
        total_stage1 = pos_score + k_score + vol_score
        if total_stage1 >= 4:
            res["score"] += 60
            res["status"] = "強勢達標"
            res["signals"].append("核心篩選過關")
        elif total_stage1 >= 2.5:
            res["score"] += 40
            res["status"] = "符合觀察"
            res["signals"].append("核心條件部分符合")
        
        # 第二階段：進階檢核指標 (簡化實作)
        if df_1m is not None and len(df_1m) >= 15:
            vol_opening = df_1m['Volume'].head(5).max()
            vol_following = df_1m['Volume'].iloc[5:15].max()
            price_min = df_1m['Close'].iloc[5:15].min()
            if vol_following < vol_opening * 0.5 and price_min >= open_p:
                res["score"] += 20
                res["details"].append("進階：量縮盤堅結構 - 波段行情起手式")
                res["signals"].append("量縮盤堅")

        # 第三階段：風險控管 (跌破開盤價 或 隔日沖倒貨特徵)
        if curr_price < open_p:
            res["score"] = 0
            res["status"] = "立刻走人"
            res["signals"].append("觸發強制出場鐵律")
            res["details"].append("風險：已跌破今日開盤價，嚴禁進場或應立即止損")
            
        # 新增：隔日沖倒貨特徵 (開盤漲幅不到 4%，爆量但不漲)
        open_change_pct = ((open_p - y_close) / y_close) * 100
        if 0 < open_change_pct < 4.0:
            if df_1m is not None and len(df_1m) >= 10:
                vol_5m = df_1m['Volume'].head(5).sum()
                price_10m_max = df_1m['High'].head(10).max()
                if vol_score == 1 and price_10m_max <= open_p * 1.01:
                    res["score"] -= 20
                    res["status"] = "倒貨警戒"
                    res["signals"].append("疑似隔日沖倒貨")
                    res["details"].append("風險：開盤漲幅不到 4% 且爆量不漲，提防主力出貨")

        return res

    def generate_entry_notes(self, last_row, is_etf):
        notes = []
        if not is_etf:
            if last_row['RSI'] > 75: notes.append("RSI指標過高，慎防追高。")
            if last_row['Volume'] < 500000: notes.append("成交量偏低，注意流動性。")
            if abs(last_row['Close'] - last_row['MA5']) / last_row['MA5'] > 0.05: notes.append("乖離率較大。")
        else: notes.append("ETF適合中長線佈局。")
        return notes

    def identify_k_patterns(self, df):
        if len(df) < 2: return []
        patterns = []; last = df.iloc[-1]; body = abs(last['Close'] - last['Open']); avg_body = abs(df['Close'] - df['Open']).tail(10).mean()
        if last['Close'] > last['Open'] and body > avg_body * 1.5: patterns.append("長紅棒：多方強勁。")
        elif last['Close'] < last['Open'] and body > avg_body * 1.5: patterns.append("長黑棒：空方壓力。")
        return patterns

    def identify_macd_details(self, df):
        details = []; hist = df['MACD_Hist']; last_h = hist.iloc[-1]; prev_h = hist.iloc[-2]
        if last_h > 0: details.append("MACD多頭" if last_h > prev_h else "MACD轉弱")
        else: details.append("MACD空頭" if last_h < prev_h else "MACD醞釀止跌")
        return details

    def evaluate_moving_averages(self, df):
        if len(df) < 60: return []
        details = []; last = df.iloc[-1]; ma5, ma10, ma20, ma60 = last['MA5'], last['MA10'], last['MA20'], last['MA60']
        if ma5 > ma10 > ma20 > ma60: details.append("多頭排列：趨勢強勁。")
        if last['Close'] > ma60: details.append("站上生命線。")
        return details

    def identify_price_levels(self, df):
        if len(df) < 20: return {"diag": []}
        window = df.tail(20); recent_high = window['High'].max(); recent_low = window['Low'].min(); last_price = df['Close'].iloc[-1]; diag = []
        if last_price >= recent_high * 0.98: diag.append(f"挑戰前高 ({recent_high})。")
        return {"recent_high": round(recent_high, 2), "recent_low": round(recent_low, 2), "diag": diag}

    def identify_bollinger_details(self, df):
        if len(df) < 20: return []
        details = []; last = df.iloc[-1]
        if 'BB_Upper' not in last: return []
        if last['Close'] >= last['BB_Upper']: details.append("觸及布林上軌。")
        return details

    def calculate_entry_strategy(self, price_df, chip_df, is_etf, intraday_snapshot=None):
        last = price_df.iloc[-1]; close = last['Close']; up = last['BB_Upper']; mid = last['BB_Middle']
        vol_avg = price_df['Volume'].iloc[:-1].tail(5).mean(); vol_ratio = last['Volume'] / (vol_avg + 1e-9)
        
        # 獲取今日開盤價
        open_p = intraday_snapshot.get('open') if intraday_snapshot else None
        
        strategy_info = {"strategy": "中性觀察", "entry_range": "建議等候回檔", "stop_loss": round(close*0.93, 2), "take_profit": round(close*1.1, 2), "strategy_notes": ["震盪期"]}
        
        if close >= up * 0.98 and vol_ratio > 1.3: 
            strategy_info = {"strategy": "強勢突破", "entry_range": "現價進場", "stop_loss": round(close*0.95, 2), "take_profit": round(close*1.1, 2), "strategy_notes": ["噴發潛力"]}
        
        # 強制加入用戶規定的出場鐵律
        if open_p:
            strategy_info["exit_rule"] = f"跌破今日開盤價 {open_p} 立刻止損出場！"
            if close < open_p:
                strategy_info["strategy"] = "立刻出場"
                strategy_info["strategy_notes"].append("!!! 已跌破今日開盤價，符合強制出場條件 !!!")
        else:
            strategy_info["exit_rule"] = "跌破今日開盤價立刻止損出場！"

        return strategy_info

    def analyze_from_raw(self, stock_id: str, raw_price: list, raw_chip: list, raw_margin: list, intraday_snapshot: dict = None):
        import pandas as pd
        
        # Convert raw JSON lists into DataFrames
        price_df = pd.DataFrame(raw_price)
        chip_df = pd.DataFrame(raw_chip)
        margin_df = pd.DataFrame(raw_margin)

        if not intraday_snapshot:
            try:
                intraday_snapshot = self.fetcher.get_intraday_data(stock_id)
            except Exception:
                intraday_snapshot = None
        
        if price_df.empty or len(price_df) < 35:
            return {"error": "資料不足"}
            
        # Ensure price_df has necessary columns and date index
        if 'date' in price_df.columns:
            price_df['date'] = pd.to_datetime(price_df['date'])
            price_df.set_index('date', inplace=True)
        # Rename columns to match what fetcher normally produces (Capitalized)
        price_df.rename(columns={'open': 'Open', 'high': 'High', 'low': 'Low', 'close': 'Close', 'Trading_Volume': 'Volume', 'Trading_money': 'Amount'}, inplace=True)
        
        if 'Volume' not in price_df.columns and 'Trading_Volume' in price_df.columns:
            price_df['Volume'] = price_df['Trading_Volume']
            
        # FinMind returns volume in shares, let's keep it as is, but check if we need to convert to thousands?
        # DataFetcher does not alter volume unit (FinMind returns shares)
        
        is_etf = self.fetcher.is_etf(stock_id)
        stock_name = self.fetcher._stock_id_map.get(str(stock_id), "未知")
        
        # Calculate Technical Indicators
        price_df['MA5'] = price_df['Close'].rolling(window=5).mean()
        price_df['MA10'] = price_df['Close'].rolling(window=10).mean()
        price_df['MA20'] = price_df['Close'].rolling(window=20).mean()
        price_df['MA60'] = price_df['Close'].rolling(window=60).mean()
        price_df['MA120'] = price_df['Close'].rolling(window=120).mean()
        price_df['MA240'] = price_df['Close'].rolling(window=240).mean()
        
        price_df['K'], price_df['D'] = self.calculate_kd(price_df)
        price_df['RSI'] = self.calculate_rsi(price_df)
        price_df['MACD_Line'], price_df['MACD_Signal'], price_df['MACD_Hist'] = self.calculate_macd(price_df)
        price_df['BB_Upper'], price_df['BB_Middle'], price_df['BB_Lower'] = self.calculate_bollinger_bands(price_df)
        
        price_df['plus_di'], price_df['minus_di'], price_df['adx'] = self.calculate_dmi(price_df)
        price_df['obv'] = self.calculate_obv(price_df)
        price_df['ad'] = self.calculate_ad(price_df)
        price_df['bias_20'] = self.calculate_bias(price_df, 20)
        
        # Calculate ATR for volatility
        tr1 = price_df['High'] - price_df['Low']
        tr2 = abs(price_df['High'] - price_df['Close'].shift(1))
        tr3 = abs(price_df['Low'] - price_df['Close'].shift(1))
        tr = pd.concat([tr1, tr2, tr3], axis=1).max(axis=1)
        price_df['atr'] = tr.rolling(window=14).mean()
        
        # Prepare chip data
        if not chip_df.empty:
            if 'date' in chip_df.columns:
                chip_df['date'] = pd.to_datetime(chip_df['date'])
            # Summarize by date (FinMind returns multiple rows per date for different institution types)
            # We want 'net_buy' as buy - sell
            chip_df['net_buy'] = chip_df['buy'] - chip_df['sell']
            chip_df = chip_df.groupby('date')['net_buy'].sum().reset_index()
            chip_df.set_index('date', inplace=True)
            self._chip_df_cache = chip_df
        else:
            self._chip_df_cache = pd.DataFrame()
            
        self._margin_df_cache = margin_df
        
        # We need vol_info. DataFetcher's get_stock_volatility uses beta concept. 
        # For simplicity in from_raw, we approximate it.
        vol_info = {'volatility': 20, 'beta': 1.0}
        if len(price_df) >= 20:
            daily_ret = price_df['Close'].pct_change().dropna()
            volatility = daily_ret.std() * np.sqrt(252) * 100
            vol_info['volatility'] = round(volatility, 2)
            
        self._vol_info_cache = vol_info

        last = price_df.iloc[-1]
        prev = price_df.iloc[-2]
        
        # Get Official info
        official = self.fetcher._official_cache.get(str(stock_id), {})
        
        # We also need vol_patterns
        vol_patterns = self.analyze_volume_patterns(price_df)
        
        # Follow the same logic as analyze() from here...
        # Check industry
        industry = "未知"
        if self.fetcher._stock_info_df is not None:
            row = self.fetcher._stock_info_df[self.fetcher._stock_info_df['stock_id'] == str(stock_id)]
            if not row.empty:
                col = 'industry' if 'industry' in self.fetcher._stock_info_df.columns else 'industry_category'
                industry = str(row[col].iloc[0])
        
        category = self.classify_category(stock_id, stock_name, industry, 50)
        if vol_info['volatility'] > 40: category = "高波動飆股"

        st_res = self.evaluate_short_term(price_df, chip_df)
        diag = []; diag.extend(self.evaluate_moving_averages(price_df)); lvl = self.identify_price_levels(price_df); 
        diag.extend(lvl["diag"]); diag.extend(self.identify_k_patterns(price_df)); diag.extend(self.identify_macd_details(price_df)); diag.extend(self.identify_bollinger_details(price_df))
        
        # 趨勢強度診斷 (DMI/ADX)
        if last['adx'] > 25:
            trend_dir = "多方" if last['plus_di'] > last['minus_di'] else "空方"
            diag.append(f"趨勢確認：目前為強勢{trend_dir}趨勢 (ADX={round(last['adx'],1)})")
        elif last['adx'] < 20:
            diag.append(f"盤整特徵：目前趨勢不明確，建議多看少做 (ADX={round(last['adx'],1)})")
            
        # 量價配合診斷 (OBV/AD)
        obv_slope = (price_df['obv'].iloc[-1] - price_df['obv'].iloc[-5]) / 5
        if obv_slope > 0 and last['Close'] > prev['Close']:
            diag.append("量價配合：OBV 呈現同步上升，買盤支撐強勁")
        elif last['Close'] > prev['Close'] and obv_slope <= 0:
            diag.append("價漲量縮：警訊！價格創新高但OBV 未同步走高")
            
        # 乖離率與 ATR 診斷
        bias_20 = last['bias_20']
        if bias_20 > 5: diag.append(f"乖離率過高 (20日)：{round(bias_20,1)}%，防回檔")
        elif bias_20 < -5: diag.append(f"超賣訊號 (20日)：{round(bias_20,1)}%，醞釀反彈")
        
        # 長期均線診斷
        if not pd.isna(last['MA240']):
            if last['Close'] > last['MA240']: diag.append("長期趨勢偏多 (站上年線)")
            else: diag.append("長期趨勢偏弱 (年線之下)")
        
        # 基本面診斷
        if official.get('roe', 0) > 15: diag.append(f"高獲利能力：ROE達 {official['roe']}%")
        if official.get('debt_ratio', 100) < 40: diag.append("財務穩健：負債比低於 40%")

        low_pe_res = self.evaluate_low_pe_strategy(price_df, chip_df, official.get("pe"))
        bottom_fishing_res = self.evaluate_bottom_fishing(price_df, chip_df, official.get("pe"))
        st_burst_res = self.evaluate_short_term_burst(price_df, chip_df)
        cdp_res = self.calculate_cdp(price_df, intraday_snapshot)
        
        change_pct = round(((last['Close']-prev['Close'])/(prev['Close']+1e-9))*100, 2)
        is_limit_up = change_pct >= 9.7
        is_limit_down = change_pct <= -9.7
        
        day_trade_cdp_res = self.evaluate_day_trade_cdp(price_df, is_limit_up, is_limit_down, cdp_res)
        
        opening_checklist = self.evaluate_opening_checklist(intraday_snapshot)
        if opening_checklist:
            if opening_checklist["score"] >= 40:
                diag.append(f"開盤檢核：{opening_checklist['status']} ({opening_checklist['score']}分)")
            if "觸發強制出場條件" in opening_checklist["signals"]:
                diag.append("!!! 警告：股價跌破開盤價，請遵守紀律停損出場 !!!")

        if bottom_fishing_res["score"] >= 50: diag.append(f"抄底訊號：{bottom_fishing_res['status']}")
        if st_burst_res["score"] >= 60: diag.append(f"短線爆發：{st_burst_res['status']}")
        if cdp_res.get("signals"): diag.extend(cdp_res["signals"])

        etf_rec = self.evaluate_etf(price_df) if is_etf else {"score":0, "status": "非ETF", "signals": []}
        strat_res = self.calculate_entry_strategy(price_df, chip_df, is_etf, intraday_snapshot)
        
        chart_data = []
        for index, row in price_df.tail(60).iterrows():
            chart_data.append({
                "time": index.strftime("%Y-%m-%d") if not isinstance(index, str) else index,
                "date": index.strftime("%m-%d") if not isinstance(index, str) else index,
                "open": round(float(row['Open']), 2) if 'Open' in row and not pd.isna(row['Open']) else 0,
                "high": round(float(row['High']), 2) if 'High' in row and not pd.isna(row['High']) else 0,
                "low": round(float(row['Low']), 2) if 'Low' in row and not pd.isna(row['Low']) else 0,
                "close": round(float(row['Close']), 2) if not pd.isna(row['Close']) else 0,
                "volume": int(row['Volume'] / 1000) if row['Volume'] > 0 else 0,
                "macd_hist": round(float(row['MACD_Hist']), 3) if not pd.isna(row['MACD_Hist']) else 0,
                "macd_line": round(float(row['MACD_Line']), 3) if not pd.isna(row['MACD_Line']) else 0,
                "macd_signal": round(float(row['MACD_Signal']), 3) if not pd.isna(row['MACD_Signal']) else 0
            })
        
        return {
            "stock_id": stock_id, "stock_name": stock_name, "is_etf": is_etf, "category": category, "total_score": st_res["score"], 
            "price": round(last['Close'], 2), "yesterday_close": round(prev['Close'], 2), "change_percent": change_pct, "is_limit_up": change_pct >= 9.7, "vol_ratio": st_res["vol_ratio"],
            "kd": f"{round(last['K'],1)}/{round(last['D'],1)}", "rsi": round(last['RSI'], 1), "macd": f"{'多方' if price_df['MACD_Hist'].iloc[-1]>0 else '空方'}", "ma5": round(last['MA5'], 2), "ma20": round(last['MA20'], 2), "ma60": round(last['MA60'], 2), "ma120": round(last['MA120'], 2) if not pd.isna(last['MA120']) else None,
            "atr": round(last['atr'], 2), "volatility": vol_info['volatility'], "adx": round(last['adx'], 1), "bias_20": round(bias_20, 1),
            "net_buy_3d": int(chip_df.tail(3)['net_buy'].sum()/1000) if not chip_df.empty else 0, "recommend_status": st_res["status"], "diagnosis": diag, 
            "pe": official.get("pe", config.PE_RATIO_DEFAULT), "yield": official.get("yield", config.YIELD_DEFAULT), "roe": official.get("roe", 0), "debt_ratio": official.get("debt_ratio", 0),
            "entry_range": strat_res["entry_range"], "stop_loss": strat_res["stop_loss"], "take_profit": strat_res["take_profit"], "strategy_name": strat_res["strategy"],
            "overnight": self.evaluate_overnight_momentum(price_df, intraday_snapshot) if not is_etf else {"score":0, "status": "N/A", "signals": []},
            "short_term_rec": self.evaluate_short_term_recommendation(price_df, chip_df, intraday_snapshot) if not is_etf else {"score":0, "status": "N/A", "signals": []}, 
            "cdp": cdp_res,
            "day_trade_cdp_rec": day_trade_cdp_res,
            "low_pe_rec": low_pe_res,
            "bottom_fishing_rec": bottom_fishing_res, "short_term_burst_rec": st_burst_res, 
            "etf_rec": etf_rec,
            "opening_checklist": opening_checklist,
            "volume_patterns": vol_patterns,
            "entry_notes": self.generate_entry_notes(last, is_etf),
            "exit_rule": strat_res.get("exit_rule"),
            "chart_data": chart_data
        }
