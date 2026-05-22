import sys
import pandas as pd
import config
from analyzer import StockAnalyzer
from data_fetcher import DataFetcher
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime

def get_market_sentiment(fetcher):
    """
    計算市場情緒指數 (0.0 ~ 1.0)
    1.0: 極佳 (多頭), 0.5: 中性, 0.2: 極差 (空頭)
    """
    try:
        # 1. 大盤趨勢 (MA20 乖離與漲跌)
        taiex_data = fetcher.get_taiex_data(days=30)
        if taiex_data.empty: return 0.5
        
        last_close = taiex_data['Close'].iloc[-1]
        ma20 = taiex_data['Close'].rolling(window=20).mean().iloc[-1]
        bias = (last_close - ma20) / ma20
        
        sentiment = 0.5
        if bias > 0.02: sentiment += 0.2
        elif bias < -0.02: sentiment -= 0.2
        
        # 2. 市場騰落指標 (Advance-Decline Ratio 簡化版)
        official = fetcher._official_cache
        if official:
            ups = len([info for sid, info in official.items() if sid != "TAIEX" and info.get('change_pct', 0) > 0])
            total = len([info for sid, info in official.items() if sid != "TAIEX"])
            if total > 0:
                ad_ratio = ups / total
                if ad_ratio > 0.6: sentiment += 0.2
                elif ad_ratio < 0.4: sentiment -= 0.2
        
        return max(0.2, min(1.0, sentiment))
    except:
        return 0.5

def main():
    print(f"\n[系統] 開始進行今日短線標的掃描 (當前時間: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')})")
    
    fetcher = DataFetcher()
    analyzer = StockAnalyzer(fetcher=fetcher)

    # 1. 獲取熱門掃描標的與財務數據
    print("   [1/3] 獲取熱門戰場標的與財務估值...")
    fetcher.fetch_twse_openapi(fetch_all=False)
    sids = fetcher.get_hot_battlefield_ids()
    if not sids:
        print("   [提示] 未偵測到今日熱門標的，使用預設監測清單。")
        sids = [
            "2330", "2317", "2454", "2303", "2603", "2609", "3231", "2382", "2356", "1513",
            "2618", "2610", "1605", "1504", "2353", "2409", "3481", "2408", "2344", "2881",
            "2882", "2883", "2884", "2886", "2891", "2892", "5880", "2880", "2885", "2887"
        ]
    
    # 2. 預先批次同步數據
    print(f"   [2/3] 預先批次同步數據 ({len(sids)} 檔)...")
    fetcher.prefetch_data(sids)

    # 3. 計算市場情緒並決定動態門檻
    market_sentiment = get_market_sentiment(fetcher)
    sentiment_label = "多頭強勢" if market_sentiment > 0.7 else "中性整理" if market_sentiment >= 0.4 else "空方轉弱"
    print(f"   [評估] 當前市場情緒: {sentiment_label} ({int(market_sentiment*100)}分)")
    
    # 動態調整門檻
    base_threshold = 40
    burst_threshold = 50
    if market_sentiment < 0.4:
        # 行情不好，門檻降低以確保有推薦，但最低不低於地板
        active_threshold = max(20, base_threshold * config.MARKET_SENTIMENT_WEIGHT)
        active_burst_threshold = max(30, burst_threshold * config.MARKET_SENTIMENT_WEIGHT)
        print(f"   [調整] 偵測到行情欠佳，動態放寬推薦門檻 ({int(active_threshold)}分) 以篩選抗跌/抄底標的。")
    else:
        active_threshold = base_threshold
        active_burst_threshold = burst_threshold

    def analyze_full(sid):
        try:
            snapshot = fetcher.get_intraday_data(sid)
            if snapshot: snapshot['stock_id'] = sid
            res = analyzer.analyze(sid, intraday_snapshot=snapshot)
            if res and "error" in res:
                return None
            return res
        except:
            return None

    print(f"   [3/3] 執行多準則並行分析... ({len(sids)} 檔)")
    results = []
    with ThreadPoolExecutor(max_workers=10) as executor:
        futures = {executor.submit(analyze_full, sid): sid for sid in sids}
        for i, future in enumerate(futures):
            res = future.result()
            if res:
                results.append(res)
    
    if not results:
        print("   [錯誤] 所有標的分析失敗，請檢查網路連線或數據源。")
        return

    print(f"   [完成] 分析完成，成功獲取 {len(results)} 檔標的高階數據。")
    
    # 定義篩選函數，確保最少推薦量
    def filter_candidates(data, key, threshold, min_count=config.MIN_REC_COUNT):
        # 1. 先按門檻篩選
        candidates = [r for r in data if r[key]['score'] >= threshold]
        
        # 2. 如果不足，則強行取 top N (至少要有分數)
        if len(candidates) < min_count:
            all_sorted = sorted([r for r in data if r[key]['score'] > 0], 
                                key=lambda x: x[key]['score'], reverse=True)
            candidates = all_sorted[:min_count]
        
        return sorted(candidates, key=lambda x: x[key]['score'], reverse=True)

    # 隔日沖候選人 (過濾漲停與高價)
    overnight_all = [r for r in results if r['price'] <= config.MAX_STOCK_PRICE_FOR_ST_REC and not r.get('is_limit_up', False)]
    overnight_candidates = filter_candidates(overnight_all, 'overnight', active_threshold)
    
    # 短線潛力候選人
    st_all = [r for r in results if r['price'] <= config.MAX_STOCK_PRICE_FOR_ST_REC]
    short_term_candidates = filter_candidates(st_all, 'short_term_rec', active_threshold)
    
    # 抄底候選人 (不限價格)
    bottom_candidates = filter_candidates(results, 'bottom_fishing_rec', active_threshold)

    # 短線衝刺候選人
    burst_candidates = filter_candidates(results, 'short_term_burst_rec', active_burst_threshold)

    # 價值標的候選人
    value_candidates = filter_candidates(results, 'low_pe_rec', active_burst_threshold)
    
    # 長期股候選人
    lt_sids = config.LONG_TERM_STOCK_IDS
    fetcher.prefetch_data(lt_sids)
    lt_results = []
    for sid in lt_sids:
        res = analyzer.analyze(sid)
        if "error" not in res: lt_results.append(res)

    # --- 輸出結果 ---
    print("\n" + "="*80)
    print(f"{'>>> 市場環境摘要 <<<':^80}")
    print("="*80)
    print(f"   市場情緒: {sentiment_label} ({int(market_sentiment*100)}分)")
    print(f"   掃描標的: {len(results)} 檔 | 推薦門檻: {int(active_threshold)}分 / {int(active_burst_threshold)}分")
    print("="*80)
    print(f"{'代號':<6} {'名稱':<10} {'價格':<8} {'殖利率':<8} {'PE':<6} {'長趨勢':<10} {'狀態'}")
    print("-" * 80)
    for res in lt_results:
        trend = "站上年線" if res.get('ma240') and res['price'] > res['ma240'] else "年線之下"
        status = "支撐強勁" if res['price'] > res['ma60'] else "弱勢整理"
        print(f"{res['stock_id']:<6} {res['stock_name']:<10} {res['price']:<8} {res['yield']:<8}% {res['pe']:<6} {trend:<10} {status}")

    def print_section(title, candidates, key, signals_key='signals', additional_cols=None):
        print("\n" + "="*80)
        print(f"{'>>> ' + title:^80}")
        print("="*80)
        if not candidates:
            print("   目前無符合條件之標的。")
            return
        
        header = f"{'排名':<4} {'代號':<6} {'名稱':<10} {'價格':<8}"
        if additional_cols:
            for col_name, _ in additional_cols:
                header += f" {col_name:<8}"
        header += f" {'得分':<6} {'診斷訊號'}"
        print(header)
        print("-" * 80)
        
        for i, res in enumerate(candidates[:10]):
            v = res[key]
            score_str = f"{v['score']}"
            if v['score'] < base_threshold:
                score_str += "(!)" # 標記低於標準門檻
                
            line = f"{i+1:<4} {res['stock_id']:<6} {res['stock_name']:<10} {res['price']:<8}"
            if additional_cols:
                for _, val_func in additional_cols:
                    line += f" {str(val_func(res, v)):<8}"
            
            signals = ",".join(v[signals_key][:3])
            line += f" {score_str:<6} {signals}"
            print(line)
            if 'status' in v:
                prefix = "     └ 狀態: " if i < 9 else "    └ 狀態: "
                print(f"{prefix}{v['status']}")

    # 輸出各個板塊
    print_section("分析師本月主推: 划算價值標的 (低PE + 短線動能)", value_candidates, 'low_pe_rec', 
                  additional_cols=[("PE", lambda r, v: r['pe']), ("開盤檢核", lambda r, v: r.get('opening_checklist', {}).get('score', '-'))])
    
    print_section("今日推薦: 隔日沖潛力標的 (今買明賣)", overnight_candidates, 'overnight',
                  additional_cols=[("漲跌%", lambda r, v: r['change_percent']), ("開盤檢核", lambda r, v: r.get('opening_checklist', {}).get('score', '-'))])
    
    print_section("明日推薦: 短線潛力標的 (波段/短沖)", short_term_candidates, 'short_term_rec',
                  additional_cols=[("量比", lambda r, v: r['vol_ratio']), ("開盤檢核", lambda r, v: r.get('opening_checklist', {}).get('score', '-'))])
    
    print_section("短線衝刺: 高動能/突破標的 (快速獲利)", burst_candidates, 'short_term_burst_rec',
                  additional_cols=[("分類", lambda r, v: r['category']), ("開盤檢核", lambda r, v: r.get('opening_checklist', {}).get('score', '-'))])
    
    print_section("抄底推薦: 止跌回升標的 (超跌 + 支撐確認)", bottom_candidates, 'bottom_fishing_rec',
                  additional_cols=[("狀態", lambda r, v: v['status']), ("開盤檢核", lambda r, v: r.get('opening_checklist', {}).get('score', '-'))])

    print("\n" + "="*80)
    print(f"{'!!! 強制出場鐵律：跌破今日「開盤價」，立刻止損走人，絕不拗單 !!!':^80}")
    print("="*80)
    if market_sentiment < 0.4:
        print(f"{'!!! 注意：當前市場氣氛低迷，推薦標的分數含金量較低，請務必嚴格執行停損 !!!':^80}")
        print("="*80)

if __name__ == "__main__":
    main()
