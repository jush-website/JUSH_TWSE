import pandas as pd
import config
from analyzer import StockAnalyzer
from data_fetcher import DataFetcher
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime
import sys

# Ensure output is UTF-8 for better character handling
if sys.stdout.encoding != 'utf-8':
    import io
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

def main():
    print(f"\n[系統] 開始進行隔日沖潛力十筆掃描 (當前時間: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')})")
    
    fetcher = DataFetcher()
    analyzer = StockAnalyzer(fetcher=fetcher)

    # 1. 獲取熱門掃描標的
    print("   [1/3] 獲取熱門戰場標的 (排除金融股)...")
    fetcher.fetch_twse_openapi(fetch_all=False)
    sids = fetcher.get_hot_battlefield_ids(exclude_bank=True)
    if not sids:
        print("   [提示] 未偵測到熱門標的，使用預設監測清單。")
        sids = [
            "2330", "2317", "2454", "2303", "2603", "2609", "3231", "2382", "2356", "1513",
            "2618", "2610", "1605", "1504", "2353", "2409", "3481", "2408", "2344", "2615"
        ]
    
    # 限制掃描數量以保證效率，取前 150 名
    sids = sids[:150]

    # 2. 預先批次同步數據
    print(f"   [2/3] 預先批次同步數據 ({len(sids)} 檔)...")
    fetcher.prefetch_data(sids)
    fetcher.prefetch_intraday_data(sids)

    def analyze_full(sid):
        try:
            snapshot = fetcher.get_intraday_data(sid)
            if snapshot: snapshot['stock_id'] = sid
            res = analyzer.analyze(sid, intraday_snapshot=snapshot)
            if "error" in res: return None
            return res
        except:
            return None

    print(f"   [3/3] 執行多準則並行分析...")
    results = []
    with ThreadPoolExecutor(max_workers=10) as executor:
        futures = {executor.submit(analyze_full, sid): sid for sid in sids}
        for future in futures:
            res = future.result()
            if res:
                results.append(res)
    
    # 隔日沖候選人 (overnight score >= 45 且價格 <= MAX_STOCK_PRICE_FOR_ST_REC，且排除漲停股)
    # 降低一點點門檻 (45) 以確保有 10 檔，如果還是不夠則按分數排序取前 10
    overnight_candidates = sorted([r for r in results if r['price'] <= config.MAX_STOCK_PRICE_FOR_ST_REC and not r.get('is_limit_up', False)], 
                                   key=lambda x: x['overnight']['score'], reverse=True)
    
    print("\n" + "="*80)
    print(f"{'>>> 隔日沖潛力十筆推薦 (今買明賣, 非金融)':^80}")
    print("="*80)
    if not overnight_candidates:
        print("   查無符合特徵之標的。")
    else:
        print(f"{'排名':<4} {'代號':<6} {'名稱':<10} {'價格':<8} {'漲跌%':<8} {'得分':<6} {'診斷訊號'}")
        print("-" * 80)
        for i, res in enumerate(overnight_candidates[:10]):
            ov = res['overnight']
            signals = ",".join(ov['signals'][:3])
            print(f"{i+1:<4} {res['stock_id']:<6} {res['stock_name']:<10} {res['price']:<8} {res['change_percent']:<8}% {ov['score']:<6} {signals}")
            print(f"     └ 狀態: {ov['status']}")

    print("\n" + "="*80)

if __name__ == "__main__":
    main()
