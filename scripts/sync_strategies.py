#!/usr/bin/env python3
"""把 11 份策略清單算好寫進 Firestore —— 不需要 Render 醒著。

原本的流程是 GitHub Actions 打 Render 的 /api/admin/force-full-sync，由 Render
邊算邊寫，Actions 只負責輪詢把它撐著不休眠。但那條路有兩個問題：Render 免費
方案隨時可能在算到一半休眠，而且運算本身跟「對外提供 API」無關，沒有理由綁在
一台長駐伺服器上。

這支直接在 Actions 裡跑同一份運算。沿用 web_app.run_all_strategy_stages()，
因為那正是 Render 上實際在跑的程式碼路徑——重寫一份只會讓兩邊走鐘。

用法：
    python3 -m scripts.sync_strategies

環境變數：
    FIREBASE_SERVICE_ACCOUNT  Firebase service account JSON（必要）
    FINMIND_API_TOKEN         FinMind token（選用）
    NVIDIA_API_KEY            NVIDIA NIM 金鑰（選用，用於清單的 AI 短評）
"""
from __future__ import annotations

import asyncio
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))


async def run() -> int:
    from src.backend import web_app as W

    if not W.firebase_db:
        print("[錯誤] Firebase 未初始化（缺少 FIREBASE_SERVICE_ACCOUNT），算了也寫不進去。")
        return 1

    print("[1/2] 預載股號對照表與官方行情…")
    loop = asyncio.get_running_loop()
    try:
        await loop.run_in_executor(None, lambda: W.fetcher.fetch_twse_openapi(fetch_all=False))
    except Exception as e:
        print(f"      預載失敗（繼續，個別策略可能因此失敗）：{e}")

    print("[2/2] 依序執行所有策略階段（與 Render 上同一份程式碼路徑）…")
    summary = await W.run_all_strategy_stages()

    ok = [k for k, v in summary.items() if v == "ok"]
    bad = {k: v for k, v in summary.items() if v != "ok"}
    print()
    print(f"[結果] 成功 {len(ok)}/{len(summary)}"
          + (f"，失敗：{', '.join(bad)}" if bad else ""))
    for name, detail in bad.items():
        print(f"::warning::{name} 同步失敗：{detail}")
    # 部分失敗不讓 workflow 紅掉（某天 FinMind 限流不該擋住其他清單），
    # 但一個都沒成功就是真的壞了。
    if not ok:
        print("[結果] 沒有任何策略清單成功寫入，視為執行失敗。")
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(asyncio.run(run()))
