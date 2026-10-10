#!/usr/bin/env python3
"""離線驗證後端兩道同步防線，不需要網路、也不需要 Firebase 憑證。

1. sync_doc_to_firestore 遇到空資料不覆寫 Firestore（三大法人曾因此整頁空白）
2. /api/admin/catch-up-sync 只在資料過期時才補（策略清單 / 全市場資料各自判斷），且有冷卻時間
3. 三大法人在 FinMind 沒回資料時改用證交所 BFI82U
4. 靜態檔路由不能用 ../ 跳出 dist（曾可讀到 /proc/self/environ 裡的所有密鑰）
5. FinMind 代理只轉發前端用到的資料集
6. FinMind 通用快取一小時過期（原本整天不換，常少最新一天）
7. 匯率、台指期日線在 FinMind 沒回資料時改用臺灣銀行、期交所官方資料（匯率再退到 Yahoo）

用法：
    python3 scripts/verify_sync_guards.py
"""
from __future__ import annotations

import asyncio
import os
import sys
from datetime import date, timedelta

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

fails = 0


def check(label, ok):
    global fails
    if not ok:
        fails += 1
    print(f"{'PASS' if ok else 'FAIL'}  {label}")


class FakeSnap:
    def __init__(self, data):
        self._data = data

    @property
    def exists(self):
        return self._data is not None

    def to_dict(self):
        return dict(self._data) if self._data is not None else None


class FakeDoc:
    def __init__(self, store, doc_id):
        self.store, self.doc_id = store, doc_id

    def set(self, value):
        self.store[self.doc_id] = value

    def get(self, field_paths=None):
        return FakeSnap(self.store.get(self.doc_id))


class FakeDb:
    def __init__(self, store):
        self.store = store

    def collection(self, _name):
        return self

    def document(self, doc_id):
        return FakeDoc(self.store, doc_id)


async def main():
    from src.backend import web_app as W

    print("── 空資料判斷 ──")
    for label, value, expect in [
        ("None", None, True),
        ("空清單", [], True),
        ("空物件", {}, True),
        ("{data: [], base_date}", {"data": [], "base_date": "2026-10-08"}, True),
        ("欄位全 None", {"price": None, "change_pct": None, "date": "2026-10-08"}, True),
        ("資料源回報錯誤", {"error": "quota"}, True),
        ("有資料的清單", [{"stock_id": "2330"}], False),
        ("{data: [..]}", {"data": [{"date": "2026-10-08"}]}, False),
        ("部分欄位有值", {"price": 23150, "change_pct": None}, False),
    ]:
        check(f"{label:22} → {'空' if expect else '有資料'}", W._is_empty_payload(value) is expect)

    print("\n── 空資料不覆寫 Firestore ──")
    good = {"data": [{"date": "2026-10-07", "合計": 1}], "base_date": "2026-10-07"}
    store = {"institutional_flow": good}
    W.firebase_db = FakeDb(store)
    W.attach_commentary = lambda data, **_: data  # 不打 NVIDIA
    written = W.sync_doc_to_firestore("institutional_flow", [])
    check("空陣列回傳 False", written is False)
    check("Firestore 上一份好資料原封不動", store["institutional_flow"] is good)
    written = W.sync_doc_to_firestore("institutional_flow", [{"date": "2026-10-08", "合計": 2}])
    check("有資料時正常寫入並回傳 True", written is True and store["institutional_flow"]["data"][0]["合計"] == 2)

    print("\n── 補同步：只在過期時動作，並有冷卻 ──")
    from datetime import datetime, timezone
    expected = date(2026, 10, 8)
    W.fetcher.get_published_base_date = lambda: expected
    runs = []

    async def fake_bg(market, strategies):
        runs.append((market, strategies))

    W._run_catch_up_bg = fake_bg
    recent = datetime.now(timezone.utc) - timedelta(minutes=10)
    old = datetime.now(timezone.utc) - timedelta(hours=5)
    fresh = {d: {"base_date": "2026-10-08"} for d in W.CATCH_UP_DOCS}
    fresh.update({d: {"updated_at": recent} for d in W.MARKET_DOCS})

    def reset():
        runs.clear()
        W._catch_up_state.update(last_started_at=None, market_last_started_at=None)

    async def hit(store):
        W.firebase_db = FakeDb(store)
        r = await W.admin_catch_up_sync()
        await asyncio.sleep(0)
        return r

    reset()
    r = await hit(fresh)
    check(f"全部最新 → fresh（{r['status']}）", r["status"] == "fresh" and not runs)

    stale = dict(fresh, long_term={"base_date": "2026-08-03"})
    del stale["cdp"]
    r = await hit(stale)
    check(f"策略過期 → 只補策略，列出 {r.get('stale')}", r["status"] == "started" and set(r["stale"]) == {"long_term", "cdp"} and runs == [(False, True)])
    r = await hit(stale)
    check(f"冷卻中再打 → cooldown（{r['status']}，約 {r.get('retry_after_seconds', 0) // 60} 分）", r["status"] == "cooldown" and len(runs) == 1)

    reset()
    market_stale = dict(fresh, news={"updated_at": old})
    del market_stale["global_market"]
    r = await hit(market_stale)
    check(f"全市場資料過期/缺 → 只補全市場，列出 {r.get('stale')}", r["status"] == "started" and set(r["stale"]) == {"news", "global_market"} and runs == [(True, False)])

    # 全市場冷卻（30 分）比策略（3 小時）短：35 分鐘後只會再補全市場
    reset()
    both = dict(stale, news={"updated_at": old})
    r = await hit(both)
    check("兩邊都過期 → 一起補", runs == [(True, True)])
    for k in ("last_started_at", "market_last_started_at"):
        W._catch_up_state[k] -= timedelta(minutes=35)
    r = await hit(both)
    check(f"35 分鐘後 → 只再補全市場（策略仍在冷卻），列出 {r.get('stale')}", runs[-1] == (True, False) and r["stale"] == ["news"])

    reset()
    W._manual_sync_state["running"] = True
    r = await hit(stale)
    check(f"同步進行中 → already_running（{r['status']}）", r["status"] == "already_running")
    W._manual_sync_state["running"] = False

    W.firebase_db = None
    r = await W.admin_catch_up_sync()
    check(f"沒有 Firestore → no_firestore（{r['status']}）", r["status"] == "no_firestore")

    print("\n── 補同步的全市場資料沿用 sync_market_data 的工作清單 ──")
    from scripts import sync_market_data as SMD
    job_ids = set(SMD.build_jobs(W))
    check("MARKET_DOCS 都是 sync_market_data 認得的項目", set(W.MARKET_DOCS) <= job_ids)
    check("沒有漏掉任何一項（扣掉策略同步會寫的兩份）", job_ids - set(W.MARKET_DOCS) == {"capital_flow", "institutional_flow"})

    print("\n── 三大法人：FinMind 失效時改用證交所 BFI82U ──")
    from src.backend import data_fetcher as DF
    # BFI82U 的回應格式（金額單位：元）
    sample = {
        "stat": "OK", "date": "20261008",
        "fields": ["單位名稱", "買進金額", "賣出金額", "買賣差額"],
        "data": [
            ["自營商(自行買賣)", "1,000", "400", "600"],
            ["自營商(避險)", "2,000", "2,500", "-500"],
            ["投信", "3,000", "1,000", "2,000"],
            ["外資及陸資(不含外資自營商)", "10,000", "4,000", "6,000"],
            ["外資自營商", "5", "5", "0"],
            ["合計", "16,005", "7,905", "8,100"],
        ],
    }
    row = DF.DataFetcher.parse_bfi82u(sample, date(2026, 10, 8))
    check(f"解析欄位 {row}", row == {
        "date": "2026-10-08", "自營商(自行買賣)": 600, "自營商(避險)": -500, "投信": 2000,
        "外資及陸資": 6000, "外資自營商": 0, "合計": 8100, "自營商": 100,
    })
    check("非交易日（stat 非 OK）→ None", DF.DataFetcher.parse_bfi82u({"stat": "很抱歉，沒有符合條件的資料!"}, date(2026, 10, 10)) is None)

    calls = []

    class FakeRes:
        ok = True

        def __init__(self, day):
            self.day = day

        def json(self):
            return dict(sample, date=self.day)

    def fake_get(url, params=None, **_):
        calls.append(params["dayDate"])
        return FakeRes(params["dayDate"])

    DF.requests.get = fake_get
    DF.time.sleep = lambda _s: None
    W.fetcher._institutional_flow_finmind = lambda days=30: []
    flow = W.fetcher.get_institutional_flow(30)
    check(f"FinMind 空 → 改抓證交所，得到 {len(flow)} 天", len(flow) == 12 and len(calls) == 12)
    check("只抓交易日（跳過週末與 10/9 國慶補假）", all(date(int(d[:4]), int(d[4:6]), int(d[6:])).weekday() < 5 for d in calls) and "20261009" not in calls)
    check("依日期由舊到新排序", [r["date"] for r in flow] == sorted(r["date"] for r in flow))

    W.fetcher._institutional_flow_finmind = lambda days=30: {"error": "quota"}
    calls.clear()
    check("FinMind 回錯誤物件也改走證交所", len(W.fetcher.get_institutional_flow(30)) == 12)

    W.fetcher._institutional_flow_finmind = lambda days=30: [{"date": "2026-10-08", "合計": 1}]
    calls.clear()
    W.fetcher.get_institutional_flow(30)
    check("FinMind 有資料時不打證交所", not calls)

    print("\n── 靜態檔路由不能跳出 dist ──")
    import tempfile
    from fastapi import HTTPException
    dist = tempfile.mkdtemp()
    os.makedirs(os.path.join(dist, "assets"))
    with open(os.path.join(dist, "index.html"), "w") as f:
        f.write("<!doctype html>INDEX")
    with open(os.path.join(dist, "assets", "app.js"), "w") as f:
        f.write("console.log(1)")
    W.frontend_path = dist
    r = await W.serve_react_app("assets/app.js")
    check("dist 裡的檔案照常提供", r.body == b"console.log(1)")
    for evil in ["../../../../proc/self/environ", "/etc/hostname", "assets/../../../../etc/hostname", "..", "../" + os.path.basename(dist) + "x/secret"]:
        r = await W.serve_react_app(evil)
        check(f"{evil:34} → 回 index.html 而不是檔案內容", r.body.startswith(b"<!doctype html>INDEX"))

    print("\n── FinMind 代理只轉發白名單 ──")
    class FakeReq:
        query_params = {"data_id": "TX"}
    W.fetcher.get_finmind_dataset = lambda ds, **kw: [{"ds": ds, **kw}]
    r = await W.get_finmind_api(FakeReq(), "TaiwanFuturesDaily")
    check("TaiwanFuturesDaily 照常轉發", r == {"data": [{"ds": "TaiwanFuturesDaily", "data_id": "TX"}]})
    try:
        await W.get_finmind_api(FakeReq(), "TaiwanStockPrice")
        check("非白名單資料集被拒", False)
    except HTTPException as e:
        check(f"非白名單資料集被拒（HTTP {e.status_code}）", e.status_code == 404)

    print("\n── FinMind 快取時效 ──")
    f = W.fetcher
    f._set_fm_cache("TaiwanExchangeRate", "k", [1])
    check("剛寫入的快取命中", f._get_fm_cache("TaiwanExchangeRate", "k") == [1])
    key = "fm:TaiwanExchangeRate_k"
    f._history_cache[key] = (f._history_cache[key][0] - f.FM_CACHE_TTL_SECONDS - 1, [1])
    check("超過一小時就失效、重新抓", f._get_fm_cache("TaiwanExchangeRate", "k") is None)

    print("\n── 匯率：FinMind 失效時改用臺灣銀行牌告匯率 ──")
    DFC = DF.DataFetcher
    bot_csv = (
        "\ufeff資料日期,幣別,匯率,現金,即期,遠期10天,遠期30天,匯率,現金,即期,遠期10天,遠期30天\n"
        "20261008,USD,本行買入,31.88,32.205,32.17,32.1,本行賣出,32.55,32.355,32.33,32.26\n"
        "20261007,USD,本行買入,31.9,32.23,32.19,32.12,本行賣出,32.57,32.38,32.35,32.28\n"
        "20260801,USD,本行買入,0,-,32.0,31.9,本行賣出,0,-,32.1,32.0\n"
    )
    rates = DFC.parse_bot_rate_csv(bot_csv.lstrip("\ufeff"), start_date="2026-08-01")
    check(f"解析並由舊到新排序：{[r['date'] for r in rates]}", [r["date"] for r in rates] == ["2026-08-01", "2026-10-07", "2026-10-08"])
    check(f"欄位與 FinMind 相同 {rates[-1]}", rates[-1] == {
        "date": "2026-10-08", "currency": "USD", "cash_buy": 31.88, "spot_buy": 32.205,
        "cash_sell": 32.55, "spot_sell": 32.355,
    })
    check("沒報價（0 或 -）→ None，不會顯示成 0", rates[0]["cash_buy"] is None and rates[0]["spot_buy"] is None)
    check("start_date 之前的資料被濾掉", len(DFC.parse_bot_rate_csv(bot_csv, start_date="2026-10-08")) == 1)

    print("\n── 台指期日線：FinMind 失效時改用期交所 ──")
    taifex_csv = (
        "交易日期,契約,到期月份(週別),開盤價,最高價,最低價,收盤價,漲跌價,漲跌%,成交量,結算價,未沖銷契約數,"
        "最後最佳買價,最後最佳賣價,歷史最高價,歷史最低價,是否因訊息面暫停交易,交易時段,價差對單式委託成交量\n"
        "2026/10/08,TX     ,202610     ,23100,23250,23010,23150,50,0.22%,52000,23148,81000,23149,23151,23900,19800,,一般,120\n"
        "2026/10/08,TX     ,202611     ,23120,23260,23030,23170,48,0.21%,1200,23166,9000,-,-,23910,19900,,一般,0\n"
        "2026/10/08,TX     ,202610/202611,20,22,18,20,-,-,300,-,-,-,-,-,-,,一般,\n"
        "2026/10/08,TX     ,202610     ,23150,23300,23100,23280,130,0.56%,31000,-,-,23279,23281,23900,19800,,盤後,\n"
    ).encode("cp950")
    fut = DFC.parse_taifex_futures_csv(taifex_csv.decode("cp950"))
    check(f"價差組合被略過，剩 {len(fut)} 筆單一合約", len(fut) == 3 and all("/" not in r["contract_date"] for r in fut))
    check(f"欄位與 FinMind 相同 {fut[0]}", fut[0] == {
        "date": "2026-10-08", "futures_id": "TX", "contract_date": "202610", "open": 23100.0, "max": 23250.0,
        "min": 23010.0, "close": 23150.0, "spread": 50.0, "spread_per": 0.22, "volume": 52000,
        "settlement_price": 23148.0, "open_interest": 81000, "trading_session": "position",
    })
    check("盤後時段標成 after_market（前端會濾掉）", fut[2]["trading_session"] == "after_market")
    check("不是 CSV（查詢失敗回 HTML）→ 空清單", DFC.parse_taifex_futures_csv("<html>查無資料</html>") == [])

    posts = []

    class FakePost:
        ok = True
        content = taifex_csv

    def fake_post(url, data=None, **_):
        posts.append((data["queryStartDate"], data["queryEndDate"]))
        return FakePost()

    class FakeBot:
        ok = True
        content = bot_csv.encode("utf-8")

    DF.requests.post = fake_post
    DF.requests.get = lambda url, **_: FakeBot()
    # 前面測 FinMind 代理時把 get_finmind_dataset 換成了假函式，這裡要測真的那支
    W.fetcher.__dict__.pop("get_finmind_dataset", None)
    W.fetcher._history_cache.clear()

    class EmptyLoader:  # FinMind 回空表（Render 上的實際狀況）
        def get_data(self, **_):
            import pandas as pd
            return pd.DataFrame()

    W.fetcher.fm_loader = EmptyLoader()
    W.fetcher._fm_backoff_until = 0
    rows = W.fetcher.get_finmind_dataset("TaiwanFuturesDaily", data_id="TX", start_date="2026-07-10", end_date="2026-10-08")
    check(f"90 天拆成 {len(posts)} 段一個月內的查詢：{posts}", len(posts) == 4 and posts[0] == ("2026/09/09", "2026/10/08"))
    check("FinMind 沒資料 → 回傳期交所資料", len(rows) == 12)
    posts.clear()
    W.fetcher.get_finmind_dataset("TaiwanFuturesDaily", data_id="TX", start_date="2026-07-10", end_date="2026-10-08")
    check("一小時內再要同一份 → 走快取，不再打期交所", not posts)
    r = W.fetcher.get_finmind_dataset("TaiwanExchangeRate", data_id="USD", start_date="2026-08-01")
    check(f"匯率改用臺灣銀行，得到 {len(r)} 筆", len(r) == 3 and r[-1]["spot_sell"] == 32.355)
    print("\n── 匯率：臺灣銀行也失敗時改用 Yahoo 收盤匯率，並記下原因 ──")
    import pandas as pd

    class HtmlRes:  # 臺灣銀行回了網頁而不是 CSV
        ok = True
        content = "<!DOCTYPE html><html>維護中</html>".encode("utf-8")

    class NotFound:
        ok = False
        status_code = 404

    bot_responses = iter([HtmlRes(), NotFound()])
    DF.requests.get = lambda url, **_: next(bot_responses)

    class FakeTicker:
        def __init__(self, sym):
            assert sym == "TWD=X"

        def history(self, period=None):
            idx = pd.to_datetime(["2026-10-07", "2026-10-08"])
            return pd.DataFrame({"Close": [32.31, float("nan")]}, index=idx).assign(Close=[32.31, 32.29])

    DF.yf.Ticker = FakeTicker
    W.fetcher._history_cache.clear()
    r = W.fetcher.get_finmind_dataset("TaiwanExchangeRate", data_id="USD", start_date="2026-10-01")
    check(f"改用 Yahoo：{r}", r == [
        {"date": "2026-10-07", "currency": "USD", "close": 32.31, "source": "yahoo"},
        {"date": "2026-10-08", "currency": "USD", "close": 32.29, "source": "yahoo"},
    ])
    notes = W.fetcher.fallback_status["TaiwanExchangeRate"]["result"]
    check(f"失敗原因可從 sync-status 查到：{notes}", "臺灣銀行 沒有資料" in notes[0] and "HTTP 404" in notes[0] and "開頭：<!DOCTYPE html>" in notes[0] and notes[1] == "Yahoo 成功 2 筆")

    class FullLoader:
        def get_data(self, **_):
            import pandas as pd
            return pd.DataFrame([{"date": "2026-10-08", "spot_buy": 1}])

    W.fetcher.fm_loader = FullLoader()
    W.fetcher._history_cache.clear()
    posts.clear()
    r = W.fetcher.get_finmind_dataset("TaiwanFuturesDaily", data_id="TX", start_date="2026-07-10")
    check("FinMind 有資料時不打官方來源", r == [{"date": "2026-10-08", "spot_buy": 1}] and not posts)
    check("沒有官方退路的資料集維持原狀", W.fetcher.get_finmind_dataset("TaiwanStockPrice") == [{"date": "2026-10-08", "spot_buy": 1}])

    print("\n全部通過" if not fails else f"\n{fails} 項失敗")
    return 1 if fails else 0


if __name__ == "__main__":
    code = asyncio.run(main())
    sys.stdout.flush()
    # data_fetcher 匯入時會留下非 daemon 的背景執行緒，照常結束會卡住（見 sync_market_data.py）
    os._exit(code)
