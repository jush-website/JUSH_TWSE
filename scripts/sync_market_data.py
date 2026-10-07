#!/usr/bin/env python3
"""把全市場資料算好直接寫進 Firestore —— 不需要任何伺服器醒著。

為什麼要這支：
    首頁、資金流向、總經、期權籌碼原本是前端即時打 Render 的 /api/*。Render
    免費方案沒有流量約 15 分鐘就休眠，使用者每次造訪都可能吃到 30-60 秒的
    冷啟動。但這些資料全部是「全市場共用、一天只變幾次」——完全沒有理由
    即時運算。改成在 GitHub Actions 算完寫進 Firestore，前端直讀，
    讀取延遲就只剩 Firestore 的 CDN 等級，而且不依賴任何長駐伺服器。

為什麼直接呼叫 web_app 的 handler：
    那些 handler（get_global_market、get_news…）本身就是 async 函式，
    FastAPI 的裝飾器只負責註冊路由，不影響直接呼叫。直接叫同一支函式，
    寫進 Firestore 的內容就與前端原本從 API 收到的完全一致，不必在這裡
    重寫一份聚合邏輯、也不會兩邊走鐘。

用法：
    python3 -m scripts.sync_market_data            # 全部
    python3 -m scripts.sync_market_data --only futures,news
    python3 -m scripts.sync_market_data --dry-run  # 只算不寫，印出摘要

環境變數：
    FIREBASE_SERVICE_ACCOUNT  Firebase service account JSON（必要，除非 --dry-run）
    FINMIND_API_TOKEN         FinMind token（選用，沒有會走較少的資料源）
"""
from __future__ import annotations

import argparse
import asyncio
import json
import os
import sys
import traceback
from datetime import datetime, timedelta

# 允許從 repo 根目錄直接執行
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))


def build_jobs():
    """延後 import：web_app 在 import 時就會初始化 DataFetcher 與 Firebase，
    放在函式裡才能先處理 --help 之類不需要那些副作用的情況。"""
    from src.backend import web_app as W

    def finmind_job(dataset, days, **params):
        """包一層 async，讓 FinMind 的同步呼叫能與其他 handler 一致地 await。

        匯率與台指期日線原本是前端打 /api/finmind/<dataset> 即時代理。但那兩份
        資料是全市場共用、一天只變一次——每個使用者各自去打一次 FinMind，
        既浪費那 600 次/小時的額度，也要為此等 Render 冷啟動。改成在這裡算好。
        """
        async def run():
            start = (datetime.now() - timedelta(days=days)).strftime("%Y-%m-%d")
            loop = asyncio.get_running_loop()
            data = await loop.run_in_executor(
                None, lambda: W.fetcher.get_finmind_dataset(dataset, start_date=start, **params)
            )
            # 與 /api/finmind/<dataset> 的回傳形狀一致（{"data": [...]}），
            # 前端的 unwrap() 兩邊都吃得下
            return {"data": data} if data else None
        return run

    # doc id → (產生資料的 handler, 說明)
    # doc id 刻意與前端的讀取鍵一致，前端只要換成讀 Firestore 就不用改其他東西。
    return {
        "global_market": (W.get_global_market, "全球主要指數"),
        "futures": (W.get_futures, "台指期"),
        "market_outlook": (W.get_market_outlook, "台股走勢展望"),
        "news": (W.get_news, "台股與全球新聞"),
        "market_breadth": (W.get_market_breadth_api, "大盤漲跌家數"),
        "market_distribution": (W.get_market_distribution, "大盤多空分布"),
        "capital_flow": (W.get_capital_flow_recommendations, "產業資金流向"),
        "institutional_flow": (W.get_institutional_flow_api, "三大法人買賣超"),
        "us_treasury": (W.get_us_treasury, "美債殖利率"),
        # 近 3 個月，與前端原本的查詢範圍一致
        "exchange_rate": (finmind_job("TaiwanExchangeRate", 90, data_id="USD"), "美元匯率"),
        "futures_daily": (finmind_job("TaiwanFuturesDaily", 90, data_id="TX"), "台指期日線"),
    }


def is_usable(data) -> tuple[bool, str]:
    """判斷這份資料值不值得寫進 Firestore。

    handler 在資料源失敗時往往不是丟例外，而是回傳「空殼」——例如台指期的
    {"price": None, "change_pct": None, ...}。若照寫，Firestore 上原本好的
    資料就會被一份全 None 蓋掉，前端畫面瞬間變空，而且看起來「同步成功」。
    寧可留著昨天的舊資料，也不要用空殼覆蓋。
    """
    if data is None:
        return False, "回傳 None"
    if isinstance(data, (list, tuple)):
        return (True, "") if len(data) > 0 else (False, "空清單")
    if isinstance(data, dict):
        if not data:
            return False, "空物件"
        if "error" in data:
            return False, f"資料源回報錯誤：{data['error']}"
        # 只看「實質欄位」：base_date / updated_at 這類中介資料即使有值，
        # 也不代表真的拿到資料。
        meta = {"base_date", "updated_at", "date", "session"}
        payload = {k: v for k, v in data.items() if k not in meta}
        if payload and all(v is None for v in payload.values()):
            return False, "所有欄位皆為 None（資料源沒回東西）"
        return True, ""
    return True, ""


async def run(only: set[str] | None, dry_run: bool) -> int:
    from src.backend import web_app as W

    jobs = build_jobs()
    if only:
        unknown = only - jobs.keys()
        if unknown:
            print(f"[錯誤] 不認得這些項目：{', '.join(sorted(unknown))}")
            print(f"       可用項目：{', '.join(sorted(jobs))}")
            return 2
        jobs = {k: v for k, v in jobs.items() if k in only}

    if not dry_run and not W.firebase_db:
        print("[錯誤] Firebase 未初始化（缺少 FIREBASE_SERVICE_ACCOUNT），"
              "算了也寫不進去。要只試算請加 --dry-run。")
        return 1

    # 先把股號對照表與官方行情快取暖起來，後面每支 handler 都會用到。
    # 不先做的話每支都會各自觸發一次同步。
    print("[1/2] 預載股號對照表與官方行情…")
    loop = asyncio.get_running_loop()
    try:
        await loop.run_in_executor(None, lambda: W.fetcher.fetch_twse_openapi(fetch_all=False))
    except Exception as e:
        print(f"      預載失敗（繼續，個別項目可能因此失敗）：{e}")

    print(f"[2/2] 開始產生 {len(jobs)} 個項目…")
    results: dict[str, str] = {}
    for doc_id, (handler, label) in jobs.items():
        try:
            data = await handler()
            # handler 可能回傳 dict 或 list；兩種都照原樣存，前端讀到的形狀才一致
            ok, why = is_usable(data)
            if not ok:
                results[doc_id] = f"skipped: {why}"
                print(f"  · {doc_id:<22} {label:<12} 跳過（{why}），保留 Firestore 上的舊資料")
                continue
            if dry_run:
                preview = json.dumps(data, ensure_ascii=False, default=str)[:160]
                print(f"  · {doc_id:<22} {label:<12} OK  {preview}")
            else:
                await loop.run_in_executor(None, W.sync_doc_to_firestore, doc_id, data)
                print(f"  · {doc_id:<22} {label:<12} 已寫入")
            results[doc_id] = "ok"
        except Exception as e:
            results[doc_id] = f"error: {e}"
            print(f"  · {doc_id:<22} {label:<12} 失敗：{e}")
            traceback.print_exc(limit=3)

    ok_ids = [k for k, v in results.items() if v == "ok"]
    skipped = {k: v for k, v in results.items() if v.startswith("skipped")}
    errored = {k: v for k, v in results.items() if v.startswith("error")}
    print()
    print(f"[結果] 寫入 {len(ok_ids)}/{len(results)}"
          + (f"、跳過 {len(skipped)}（{', '.join(skipped)}）" if skipped else "")
          + (f"、失敗 {len(errored)}（{', '.join(errored)}）" if errored else ""))
    # 部分失敗不讓整個 workflow 紅掉：某一天 FinMind 掛掉不該擋住其他項目。
    # 但一個都沒寫進去就是真的壞了，要失敗退出讓 Actions 顯示紅燈。
    if not ok_ids:
        print("[結果] 沒有任何項目成功寫入，視為執行失敗。")
        return 1
    return 0


def main() -> int:
    p = argparse.ArgumentParser(description="把全市場資料算好寫進 Firestore")
    p.add_argument("--only", help="只跑指定項目，用逗號分隔")
    p.add_argument("--dry-run", action="store_true", help="只運算與印出，不寫入 Firestore")
    p.add_argument("--list", action="store_true", help="列出所有可用項目後結束")
    args = p.parse_args()

    if args.list:
        for doc_id, (_, label) in build_jobs().items():
            print(f"{doc_id:<22} {label}")
        return 0

    only = {s.strip() for s in args.only.split(",") if s.strip()} if args.only else None
    return asyncio.run(run(only, args.dry_run))


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
