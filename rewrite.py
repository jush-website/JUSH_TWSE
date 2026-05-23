import re

with open('src/backend/analyzer.py', 'r', encoding='utf-8') as f:
    content = f.read()

# We need to replace evaluate_overnight_momentum completely
start_idx = content.find('    def evaluate_overnight_momentum(self, price_df, intraday_data):')
if start_idx == -1:
    print('Function not found')
    exit(1)

# Find the next function definition '    def '
end_idx = content.find('    def ', start_idx + 1)
if end_idx == -1:
    end_idx = len(content)

new_func = '''    def evaluate_overnight_momentum(self, price_df, intraday_data):
        if not intraday_data: return {"score": 0, "status": "無數據", "signals": []}
        prev_close = intraday_data['yesterday_close']; curr_price = intraday_data['price']; change_pct = ((curr_price - prev_close) / prev_close) * 100
        stock_id = intraday_data.get('stock_id', ""); score = 0; signals = []
        
        # 1. 基礎流動性過濾: 成交量不可低於 10000 張 (10,000,000 股)
        curr_vol = price_df['Volume'].iloc[-1]
        if curr_vol < 10000000:
            return {"score": 0, "status": "流動性不足", "signals": ["成交量低於 10000 張"]}
        
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

'''

content = content[:start_idx] + new_func + content[end_idx:]

with open('src/backend/analyzer.py', 'w', encoding='utf-8') as f:
    f.write(content)
print('Successfully rewritten evaluate_overnight_momentum.')
