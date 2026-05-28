    def analyze_from_raw(self, stock_id: str, raw_price: list, raw_chip: list, raw_margin: list, intraday_snapshot: dict = None):
        import pandas as pd
        
        # Convert raw JSON lists into DataFrames
        price_df = pd.DataFrame(raw_price)
        chip_df = pd.DataFrame(raw_chip)
        margin_df = pd.DataFrame(raw_margin)
        
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
        official = self.fetcher.get_official_data(stock_id)
        
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
                "date": index.strftime("%m-%d") if not isinstance(index, str) else index,
                "volume": int(row['Volume'] / 1000) if row['Volume'] > 0 else 0,
                "close": round(float(row['Close']), 2) if not pd.isna(row['Close']) else 0,
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
