#!/usr/bin/env python3
"""把熱門股的個股原始資料預先抓進 Firestore 的 raw_data_cache。

為什麼：
    個股分析頁的分析運算本來就在瀏覽器跑，後端的 /api/raw-data 只是「資料來源
    + Firestore 快取」。前端現在會先直接讀 raw_data_cache（見
    src/utils/rawDataCache.js），快取新鮮就完全不碰後端。但快取要有人填——
    不填的話第一個查某檔股票的人仍要等 Render 冷啟動加 9 份 FinMind 抓取。
    這支就是在盤後把最可能被查的那幾檔先填好。

為什麼直接呼叫 web_app.get_raw_data()：
    那支 handler 已經包含「看快取、沒有才抓、抓完寫回 Firestore」的完整邏輯，
    而且是 Render 上實際在跑的程式碼。重寫一份只會讓兩邊走鐘，也要重新猜
    FinMind 的 9 個 dataset 參數。

注意額度：每檔股票約 8 份 FinMind 資料，加上新聞那段最多會往前試 10 天，
所以單檔最壞情況接近 18 次請求。FinMind 免費版是 600 次/小時，預設只暖
15 檔（約 270 次），要調大請自己確認額度。

用法：
    python3 -m scripts.warm_raw_cache                # 熱門股前 15 檔
    python3 -m scripts.warm_raw_cache --limit 30
    python3 -m scripts.warm_raw_cache --ids 2330,2317,2454
"""
from __future__ import annotations

import argparse
import asyncio
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

DEFAULT_LIMIT = 15


async def run(ids: list[str] | None, limit: int) -> int:
    from src.backend import web_app as W

    if not W.firebase_db:
        print("[錯誤] Firebase 未初始化（缺少 FIREBASE_SERVICE_ACCOUNT），"
              "抓了也寫不進快取。")
        return 1

    loop = asyncio.get_running_loop()
    print("[1/2] 預載股號對照表與官方行情…")
    try:
        await loop.run_in_executor(None, lambda: W.fetcher.fetch_twse_openapi(fetch_all=False))
    except Exception as e:
        print(f"      預載失敗：{e}")

    if not ids:
        try:
            ids = (await loop.run_in_executor(None, W.fetcher.get_hot_battlefield_ids))[:limit]
        except Exception as e:
            print(f"[錯誤] 取得熱門標的失敗：{e}")
            return 1
    if not ids:
        print("[提示] 沒有取得任何熱門標的，略過。")
        return 0

    print(f"[2/2] 開始暖 {len(ids)} 檔：{', '.join(ids)}")
    ok, failed = [], {}
    for sid in ids:
        try:
            # get_raw_data 本身就會先看快取、沒有才抓、抓完寫回 Firestore
            data = await W.get_raw_data(sid)
            bars = len((data or {}).get("price_data") or [])
            if bars == 0:
                failed[sid] = "沒有價格資料"
                print(f"  · {sid:<8} 沒有價格資料，未寫入")
                continue
            ok.append(sid)
            print(f"  · {sid:<8} OK（{bars} 根日 K）")
        except Exception as e:
            failed[sid] = str(e)[:80]
            print(f"  · {sid:<8} 失敗：{str(e)[:80]}")

    print()
    print(f"[結果] 成功 {len(ok)}/{len(ids)}" + (f"，失敗：{', '.join(failed)}" if failed else ""))
    for sid, why in failed.items():
        print(f"::warning::{sid} 暖快取失敗：{why}")
    # 一檔都沒成功才算失敗：被 FinMind 限流時暖幾檔算幾檔，不該讓 workflow 紅掉
    return 0 if ok else 1


def main() -> int:
    p = argparse.ArgumentParser(description="預先抓熱門股的原始資料到 Firestore 快取")
    p.add_argument("--ids", help="指定代號，逗號分隔（給了就忽略 --limit）")
    p.add_argument("--limit", type=int, default=DEFAULT_LIMIT,
                   help=f"暖幾檔熱門股（預設 {DEFAULT_LIMIT}，注意 FinMind 額度）")
    args = p.parse_args()
    ids = [s.strip() for s in args.ids.split(",") if s.strip()] if args.ids else None
    return asyncio.run(run(ids, args.limit))


def _exit_now(code: int) -> None:
    """跑完立刻結束行程，不等背景執行緒。

    DataFetcher 在官方快取過期時會開一條非 daemon 的背景執行緒
    （data_fetcher.update_cache_with_realtime），用 yfinance 把全市場
    約 2362 檔重抓一遍。在長駐的 Render 上那是合理的背景更新；但在
    批次腳本裡，Python 結束前會等它跑完——實測印完結果後還要多掛約
    2.5 分鐘，而且它更新的是即將被丟掉的記憶體快取，純屬浪費。

    所有 Firestore 寫入都是同步完成並已 await 過的，這裡直接結束是安全的。
    """
    sys.stdout.flush()
    sys.stderr.flush()
    os._exit(code)


if __name__ == "__main__":
    _exit_now(main())
