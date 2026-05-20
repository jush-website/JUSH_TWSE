import sys
import re
import threading
import time
from datetime import datetime
from src.backend import config
from src.backend.analyzer import StockAnalyzer
from src.backend.data_fetcher import DataFetcher
from concurrent.futures import ThreadPoolExecutor
from rich.console import Console
from rich.table import Table
from rich.panel import Panel
from rich.layout import Layout
from rich.progress import Progress, SpinnerColumn, TextColumn, BarColumn, TaskProgressColumn
from rich import print as rprint
from rich.columns import Columns
from rich.text import Text
from rich.align import Align

console = Console()

class StockDashboard:
    def __init__(self):
        self.fetcher = DataFetcher()
        self.analyzer = StockAnalyzer(fetcher=self.fetcher)
        self.valid_ids = set(self.fetcher.get_all_stock_ids())
        self.last_sync_status = self.fetcher.get_market_status()

    def make_header(self):
        now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        market_status = self.fetcher.get_market_status()
        
        # 獲取指標數據日期 (從 official_cache 或 history_cache 中找最新的)
        data_date = "確認中..."
        dates = []
        if self.fetcher._official_cache:
            for v in self.fetcher._official_cache.values():
                if isinstance(v, dict) and 'date' in v:
                    dates.append(v['date'])
                    if len(dates) > 10: break
        
        if self.fetcher._history_cache:
            for v in self.fetcher._history_cache.values():
                if hasattr(v, 'index') and not v.empty:
                    dates.append(v.index[-1].strftime("%Y-%m-%d"))
                    if len(dates) > 20: break
        
        if dates:
            data_date = max(dates)

        grid = Table.grid(expand=True)
        grid.add_column(justify="left", ratio=1)
        grid.add_column(justify="center", ratio=1)
        grid.add_column(justify="right", ratio=1)
        grid.add_row(
            f"[bold cyan]市場狀態:[/bold cyan] {market_status} ([dim]{data_date}[/dim])",
            f"[bold white]台股偵測系統 (Optimized v2)[/bold white]",
            f"[bold yellow]系統時間:[/bold yellow] {now}"
        )
        return Panel(grid, style="white on blue", border_style="cyan")

    def make_menu(self):
        menu_table = Table.grid(padding=(0, 2))
        menu_table.add_column(style="green", justify="right")
        menu_table.add_column(style="white")
        
        items = [
            ("0", "數據同步 (官方最新)"),
            ("1", "短線爆發 (150元內精選)"),
            ("2", "長期股推薦 (長線存股)"),
            ("3", "個股分析 (深度進退場)"),
            ("4", "隔日沖偵測 (尾盤強勢)"),
            ("5", "ETF 佈局 (穩健進場)"),
            ("6", "抄底推薦 (止跌回升)"),
            ("7", "短線衝刺 (動能突破)"),
            ("8", "CDP 逆勢分析 (實戰/預覽)"),
            ("9", "退出系統")
        ]
        
        for idx, (code, name) in enumerate(items):
            menu_table.add_row(f"[{code}]", name)
            
        return Panel(Align.center(menu_table), title="[bold yellow]主選單[/bold yellow]", border_style="yellow")

    def display_stock_details(self, res):
        color = "red" if res['change_percent'] > 0 else "green"
        
        # 第一層：價格與分類資訊
        header_text = f"[bold white]{res['stock_id']} {res['stock_name']}[/bold white] | [bold yellow]{res.get('category', '一般熱門股')}[/bold yellow]\n"
        header_text += f"昨收: [bold white]{res['yesterday_close']}[/bold white]  |  現價: [bold {color}]{res['price']}[/bold {color}] ([{color}]{res['change_percent']}%[/{color}])"
        
        # 第二層：技術與財務網格
        tech_grid = Table.grid(expand=True, padding=1)
        tech_grid.add_column(ratio=1)
        tech_grid.add_column(ratio=1)
        tech_grid.add_column(ratio=1)
        
        # 面板 1: 技術指標
        tech_content = f"● KD: {res['kd']} | RSI: {res['rsi']}\n● MACD: {res['macd']}\n● ADX: {res.get('adx', 0)} (趨勢強度)\n● ATR: {res.get('atr', 0)} | 波動: {res.get('volatility', 0)}%"
        tech_p = Panel(tech_content, title="技術指標", border_style="cyan")
        
        # 面板 2: 均線與量能
        ma_content = f"● MA5: {res.get('ma5', 'N/A')}\n● MA10: {res.get('ma10', 'N/A')}\n● MA20: {res.get('ma20', 'N/A')}\n● 量比: {res['vol_ratio']} | 乖離: {res.get('bias_20', 0)}%"
        ma_p = Panel(ma_content, title="均線量能", border_style="magenta")
        
        # 面板 3: 財務與籌碼
        fin_content = f"● PE: {res['pe']} | 殖利率: {res['yield']}%\n● ROE: {res.get('roe', 0)}% | 負債: {res.get('debt_ratio', 0)}%\n● 法人3日: {res['net_buy_3d']}張"
        fin_p = Panel(fin_content, title="財務籌碼", border_style="yellow")
        
        tech_grid.add_row(tech_p, ma_p, fin_p)

        # CDP 面板
        cdp = res.get('cdp', {})
        cdp_p = None
        if cdp:
            # 根據 analyzer 傳回的 is_preview 標記決定標題
            is_preview = cdp.get('is_preview', False)
            base_date = cdp.get('base_date', '未知')
            
            if is_preview:
                cdp_title = f"CDP 逆勢指標 (明日預覽 - 基準日: {base_date})"
                border_style = "magenta"
            else:
                cdp_title = f"CDP 逆勢指標 (今日實戰 - 基準日: {base_date})"
                border_style = "cyan"

            cdp_content = f"● AH (最高值): {cdp['AH']}  |  NH (近高值): {cdp['NH']}  |  [bold cyan]CDP: {cdp['CDP']}[/bold cyan]\n● NL (近低值): {cdp['NL']}  |  AL (最低值): {cdp['AL']}"
            cdp_p = Panel(cdp_content, title=cdp_title, border_style=border_style)
        
        # 第三層：診斷結論
        diag_list = "\n".join([f" [cyan]▶[/cyan] {item}" for item in res['diagnosis']])
        diag_p = Panel(diag_list if diag_list else "指標中性，暫無明顯特徵。", title="波段診斷結論", border_style="white")
        
        # 第四層：行動建議
        # 評分與推薦狀態
        status_text = res.get('recommend_status', '觀察中')
        advice_grid = Table.grid(expand=True)
        advice_grid.add_column(ratio=1)
        advice_grid.add_column(ratio=2)
        
        # 判斷是否顯示開盤檢核評分
        oc = res.get('opening_checklist', {})
        bf = res.get('bottom_fishing_rec', {})
        if oc and oc.get('score', 0) > 0:
            oc_color = "red" if oc['status'] == "立刻走人" else "yellow" if oc['score'] >= 60 else "white"
            score_text = f"\n[bold white]綜合評分: {res['total_score']}[/bold white]\n[bold {oc_color}]開盤檢核: {oc['score']}[/bold {oc_color}]\n[dim]{oc['status']}[/dim]"
        # 判斷是否顯示抄底評分
        elif bf.get('score', 0) >= 50:
            score_text = f"\n[bold white]綜合評分: {res['total_score']}[/bold white]\n[bold yellow]抄底評分: {bf['score']}[/bold yellow]\n[dim]{bf['status']}[/dim]"
        else:
            score_text = f"\n[bold white]綜合評分[/bold white]\n[bold yellow]{res['total_score']}[/bold yellow]\n[dim]{status_text}[/dim]"
            
        score_p = Panel(Align.center(score_text), border_style="green")
        
        exit_rule = res.get('exit_rule', "跌破今日開盤價立刻止損出場！")
        action_content = f"[bold white]策略:[/bold white] {res.get('strategy_name', '中性觀察')}\n"
        action_content += f"[bold cyan]進場區間:[/bold cyan] {res.get('entry_range', '等待訊號')}\n"
        action_content += f"[bold red]停損建議:[/bold red] {res.get('stop_loss', 'N/A')}  |  [bold green]停利建議:[/bold green] {res.get('take_profit', 'N/A')}\n"
        action_content += f"[bold yellow]出場鐵律:[/bold yellow] {exit_rule}\n"
        
        # 獲取進場筆記 (由 analyzer 預先計算)
        notes_list = res.get('entry_notes', [])
        notes = "\n".join([f" • {n}" for n in notes_list[:3]])
        if notes:
            action_content += f"\n[bold yellow]提醒:[/bold yellow]\n{notes}"
        
        action_p = Panel(action_content, title="操作建議", border_style="green")
        
        advice_grid.add_row(score_p, action_p)
        
        # 顯示開盤檢核細節 (如果有)
        oc_panel = None
        if oc and oc.get('details'):
            oc_details = "\n".join([f" [yellow]▸[/yellow] {d}" for n, d in enumerate(oc['details'])])
            oc_panel = Panel(oc_details, title="今日開盤核心篩選 (Stage 1 & 2)", border_style="yellow")

        # 最終組合顯示
        console.clear()
        console.print(self.make_header())
        console.print(Panel(Align.center(header_text), border_style=color))
        console.print(tech_grid)
        if cdp_p: console.print(cdp_p)
        if oc_panel: console.print(oc_panel)
        console.print(diag_p)
        console.print(advice_grid)
        console.input("\n[bold yellow]按 Enter 鍵返回個股查詢...[/bold yellow]")

    def run(self):
        while True:
            console.clear()
            console.print(self.make_header())
            
            # 自動同步邏輯：根據 config.INTRADAY_CACHE_EXPIRY (15分鐘) 自動更新
            self.fetcher.sync_if_needed()
            
            # 原有的開盤自動同步提醒邏輯 (保留並優化)
            current_status = self.fetcher.get_market_status()
            if self.last_sync_status == "盤前 (昨收數據)" and current_status == "盤中 (即時行情)":
                console.print("\n[bold cyan][系統][/bold cyan] 偵測到開盤時間，正在同步即時行情...")
                self.last_sync_status = current_status
            
            console.print(self.make_menu())
            
            choice = console.input("[bold yellow]請選擇功能 (0-9): [/bold yellow]")

            if choice == "0":
                mode = console.input("模式 (1:熱門, 2:全市場): ")
                self.fetcher.fetch_twse_openapi(fetch_all=(mode == "2"))
                continue

            elif choice == "1":
                self.show_recommendations()

            elif choice == "2":
                self.show_long_term_recommendations()

            elif choice == "3":
                self.individual_analysis_loop()

            elif choice == "4":
                self.show_overnight_momentum()

            elif choice == "5":
                self.show_etf_recommendations()

            elif choice == "6":
                self.show_bottom_fishing_recommendations()

            elif choice == "7":
                self.show_short_term_burst_recommendations()

            elif choice == "8":
                self.show_cdp_recommendations()

            elif choice == "9":
                sys.exit()

    def show_short_term_burst_recommendations(self):
        self.fetcher.sync_if_needed()
        console.print("[dim][系統] 正在獲取高動能標的...[/dim]")
        sids = self.fetcher.get_hot_battlefield_ids()[:100]
        self.fetcher.prefetch_data(sids)
        
        results = []
        with Progress(console=console) as progress:
            task = progress.add_task("[yellow]動能掃描中...", total=len(sids))
            with ThreadPoolExecutor(max_workers=8) as executor:
                futures = {executor.submit(self.analyzer.analyze, sid): sid for sid in sids}
                for future in futures:
                    try:
                        res = future.result()
                        if "error" not in res:
                            results.append(res)
                    except: pass
                    progress.advance(task)
        
        results.sort(key=lambda x: x['short_term_burst_rec']['score'], reverse=True)
        top_burst = [r for r in results if r['short_term_burst_rec']['score'] >= 50][:15]
        
        if top_burst:
            table = Table(title="短線衝刺推薦 (高動能/突破標的)", show_header=True, header_style="bold magenta", expand=True)
            table.add_column("標的", justify="center")
            table.add_column("價格", justify="right")
            table.add_column("狀態", justify="center")
            table.add_column("得分", justify="center")
            table.add_column("停損", justify="right")
            table.add_column("停利", justify="right")
            table.add_column("診斷訊號", justify="left")
            
            for res in top_burst:
                sb = res['short_term_burst_rec']
                table.add_row(
                    f"{res['stock_id']} {res['stock_name']}", f"{res['price']}",
                    f"[bold]{sb['status']}[/bold]", f"[bold yellow]{sb['score']}[/bold yellow]",
                    f"{sb['stop_loss']}", f"{sb['take_profit']}", " | ".join(sb['signals'][:3])
                )
            console.print(table)
            console.print("\n[dim]短線紀律: 破今日低點或停損價堅決出場；高檔爆量長黑即時停利。[/dim]")
        else:
            console.print("\n[bold red]目前無符合短線強勢動能特徵之標的。[/bold red]")
            
        console.input("\n按 Enter 返回主選單...")

    def show_bottom_fishing_recommendations(self):
        self.fetcher.sync_if_needed()
        console.print("[dim][系統] 正在獲取篩選標的...[/dim]")
        # 抄底通常看熱門股或是權值股
        sids = self.fetcher.get_hot_battlefield_ids()[:120]
        self.fetcher.prefetch_data(sids)
        
        results = []
        with Progress(console=console) as progress:
            task = progress.add_task("[yellow]抄底診斷中...", total=len(sids))
            with ThreadPoolExecutor(max_workers=8) as executor:
                futures = {executor.submit(self.analyzer.analyze, sid): sid for sid in sids}
                for future in futures:
                    try:
                        res = future.result()
                        if "error" not in res:
                            results.append(res)
                    except: pass
                    progress.advance(task)
        
        # 依抄底評分排序
        results.sort(key=lambda x: x['bottom_fishing_rec']['score'], reverse=True)
        top_bf = [r for r in results if r['bottom_fishing_rec']['score'] >= 50][:15]
        
        if top_bf:
            table = Table(title="抄底推薦標的 (止跌回升精選)", show_header=True, header_style="bold magenta", expand=True)
            table.add_column("標的", justify="center")
            table.add_column("價格", justify="right")
            table.add_column("狀態", justify="center")
            table.add_column("得分", justify="center")
            table.add_column("停損", justify="right")
            table.add_column("診斷訊號", justify="left")
            
            for res in top_bf:
                bf = res['bottom_fishing_rec']
                table.add_row(
                    f"{res['stock_id']} {res['stock_name']}", f"{res['price']}",
                    f"[bold]{bf['status']}[/bold]", f"[bold yellow]{bf['score']}[/bold yellow]",
                    f"{bf['stop_loss']}", " | ".join(bf['signals'][:3])
                )
            console.print(table)
            console.print("\n[dim]抄底原則: 分批佈局、嚴守停損。若跌破止跌 K 線低點應果斷離場。[/dim]")
        else:
            console.print("\n[bold red]目前市場中無明顯符合抄底特徵之標的。[/bold red]")
            
        console.input("\n按 Enter 返回主選單...")

    def individual_analysis_loop(self):
        while True:
            query = console.input("\n[bold yellow]請輸入股票代碼或名稱 (0/q 返回): [/bold yellow]")
            if not query or query.lower() in ["0", "q"]: break
            
            sid = self.fetcher.resolve_stock_id(query)
            if not sid:
                console.print("[bold red]找不到該標的。[/bold red]")
                continue
            
            try:
                with console.status(f"[bold yellow]深度分析中 {sid} ...[/bold yellow]"):
                    snapshot = self.fetcher.get_intraday_data(sid)
                    if snapshot: snapshot['stock_id'] = sid
                    res = self.analyzer.analyze(sid, intraday_snapshot=snapshot)
                
                if "error" in res:
                    console.print(f"[bold red]錯誤: {res['error']}[/bold red]")
                    continue
                
                self.display_stock_details(res)
            except Exception as e:
                console.print(f"[bold red]分析或顯示過程中發生錯誤: {e}[/bold red]")
                continue

    def show_recommendations(self):
        self.fetcher.sync_if_needed()
        console.print("[dim][系統] 正在獲取熱門標的 ID...[/dim]")
        sids = self.fetcher.get_hot_battlefield_ids()
        if not sids:
            sids = ["2330", "2317", "2454", "2303", "2603", "2609", "3231", "2382", "2356", "1513", "2618", "2610", "1605", "1504"]
        sids = sids[:100]
        
        console.print(f"[dim][系統] 成功獲取 {len(sids)} 檔標的進行分析。[/dim]")
        self.fetcher.prefetch_data(sids)
        console.print(f"\n[cyan]正在篩選「短線爆發」潛力股 (已排除銀行股)...[/cyan]")
        
        results = []
        bank_results = []
        
        with Progress(console=console) as progress:
            task = progress.add_task("[yellow]診斷中...", total=len(sids))
            with ThreadPoolExecutor(max_workers=10) as executor:
                futures = {executor.submit(self.analyzer.analyze, sid): sid for sid in sids}
                for future in futures:
                    sid = futures[future]
                    try:
                        res = future.result(timeout=30)
                        if res and "error" not in res:
                            score = res["short_term_rec"]["score"]
                            if self.fetcher.is_bank(sid):
                                bank_results.append((score, res))
                            elif res['price'] <= config.MAX_STOCK_PRICE_FOR_ST_REC:
                                results.append((score, res))
                    except: pass
                    progress.advance(task)

        # 顯示一般潛力股
        results.sort(key=lambda x: x[0], reverse=True)
        # 如果整體分數偏低，顯示前 10 檔（至少大於 0 分）
        top_10 = [r for r in results if r[0] > 0][:10]
        
        if top_10:
            table = Table(title=f"短線推薦標的 (150元內, 非金融)", show_header=True, header_style="bold magenta", expand=True)
            table.add_column("排名", justify="center", width=4)
            table.add_column("標的", justify="center")
            table.add_column("價格", justify="right")
            table.add_column("漲跌%", justify="right")
            table.add_column("狀態", justify="center")
            table.add_column("推薦進場時機", justify="left")
            table.add_column("評分", justify="center")
            
            for i, (score, res) in enumerate(top_10):
                st = res["short_term_rec"]
                color = "red" if res['change_percent'] > 0 else "green"
                table.add_row(
                    str(i+1), f"{res['stock_id']} {res['stock_name']}", f"{res['price']}",
                    f"[{color}]{res['change_percent']}%[/{color}]", f"[bold]{st['status']}[/bold]",
                    f"{res['entry_range']}", f"[bold yellow]{st['score']}[/bold yellow]"
                )
            console.print(table)
        else:
            console.print("\n[bold red]目前無符合特徵之一般標的。[/bold red]")

        # 顯示銀行/金融股推薦
        bank_results.sort(key=lambda x: x[0], reverse=True)
        top_banks = bank_results[:5]
        if top_banks:
            b_table = Table(title=f"金融/銀行股潛力監測", show_header=True, header_style="bold blue", expand=True)
            b_table.add_column("標的", justify="center")
            b_table.add_column("價格", justify="right")
            b_table.add_column("漲跌%", justify="right")
            b_table.add_column("評分", justify="center")
            b_table.add_column("診斷訊號", justify="left")
            
            for _, res in top_banks:
                color = "red" if res['change_percent'] > 0 else "green"
                b_table.add_row(
                    f"{res['stock_id']} {res['stock_name']}", f"{res['price']}",
                    f"[{color}]{res['change_percent']}%[/{color}]", f"[bold yellow]{res['total_score']}[/bold yellow]",
                    " | ".join(res['diagnosis'][:2])
                )
            console.print(b_table)

        console.input("\n按 Enter 返回主選單...")

    # 長期股推薦 (取代原熱門掃描)
    def show_long_term_recommendations(self):
        desc = """長期股票（或稱存股、長線投資）通常指持有時間超過 3-5 年以上，以追求企業價值增長、穩定配息或產業潛力為目的的投資方式。

[bold cyan]一、 基本面觀察（選股關鍵）[/bold cyan]
 ● [yellow]高毛利率與營益率[/yellow]: 表示競爭力強、經營效率好。
 ● [yellow]獲利能力[/yellow]: 連續多年穩定配息、EPS 逐年成長。
 ● [yellow]護城河[/yellow]: 具有技術專利、品牌優勢或產業壟斷地位。
 ● [yellow]產業趨勢[/yellow]: 選擇未來 5-10 年持續發展的產業 (如AI、綠能、核心金融)。

[bold cyan]二、 技術面觀察（進場時機）[/bold cyan]
 ● [yellow]年線 (240MA)[/yellow]: 長期多空分界線，股價在年線之上通常代表趨勢向上。
 ● [yellow]均線糾結[/yellow]: 當短、中、長期均線糾結後向上發散，是較好的起漲點。
 ● [yellow]定期定額[/yellow]: 透過長期、定期的分批投入，有效平均成本並降低風險。

[bold cyan]三、 執行與追蹤原則[/bold cyan]
 ● 分散投資不同產業或市場型 ETF (如0050) 以分擔風險。
 ● 設定報酬期望值 (如年10%)，達標可部分落袋。
 ● 定期檢視財報，若競爭力下降需果斷汰換。"""
        
        console.print(Panel(desc, title="[bold yellow]長期投資 (存股) 核心指南[/bold yellow]", border_style="cyan"))
        
        # 獲取長期觀察標的 (從 config 讀取)
        sids = config.LONG_TERM_STOCK_IDS
        self.fetcher.prefetch_data(sids)
        
        table = Table(title="長期價值股監測 (存股標的精選)", show_header=True, header_style="bold magenta", expand=True)
        table.add_column("標的", justify="center")
        table.add_column("價格", justify="right")
        table.add_column("殖利率", justify="right")
        table.add_column("PE", justify="right")
        table.add_column("生命線(MA60)", justify="center")
        table.add_column("長趨勢(MA240)", justify="center")
        table.add_column("診斷訊號", justify="left")

        with Progress(console=console) as progress:
            task = progress.add_task("[yellow]分析中...", total=len(sids))
            for sid in sids:
                try:
                    res = self.analyzer.analyze(sid)
                    if "error" not in res:
                        # 生命線 (MA60) 狀態
                        ma60_status = "[red]支撐[/red]" if res['price'] > res['ma60'] else "[green]偏弱[/green]"
                        
                        # 長趨勢 (MA240) 狀態
                        if res.get('ma240'):
                            trend_240 = "[bold red]多頭[/bold red]" if res['price'] > res['ma240'] else "[dim]整理[/dim]"
                        else:
                            trend_240 = "[dim]數據不足[/dim]"
                        
                        yield_str = f"{res['yield']}%"
                        pe_str = f"{res['pe']}"
                        
                        table.add_row(
                            f"{res['stock_id']} {res['stock_name']}", f"{res['price']}",
                            yield_str, pe_str, ma60_status, trend_240, 
                            " | ".join(res['diagnosis'][:2])
                        )
                except: pass
                progress.advance(task)
                
        console.print(table)
        console.print("\n[dim]註: 長趨勢(MA240) 建議於年線附近分批佈局，殖利率 > 4% 具備較佳防守力。[/dim]")
        console.input("\n按 Enter 返回主選單...")

    def show_industries(self):
        industries = self.fetcher.get_industry_list()
        ind_list = [f"[green]{i+1:2}.[/green] {ind}" for i, ind in enumerate(industries)]
        console.print(Panel(Columns(ind_list, width=22), title="產業類別 (標準化)"))
        
        idx = console.input("\n[bold yellow]請輸入編號 (0 返回): [/bold yellow]")
        if idx == "0": return
        
        if idx.isdigit() and 0 < int(idx) <= len(industries):
            target = industries[int(idx)-1]
            sids = self.fetcher.search_stocks_by_industry(target)
            if not sids:
                console.print(f"[red]找不到 {target} 相關的有效個股。[/red]")
                return
            
            # 批次同步數據，減少個別下載產生的錯誤訊息
            self.fetcher.prefetch_data(sids)
            
            table = Table(title=f"{target} 板塊行情 (前 30 檔)", show_header=True, header_style="bold magenta", expand=True)
            table.add_column("代號", justify="center")
            table.add_column("名稱", justify="center")
            table.add_column("價格", justify="right")
            table.add_column("漲跌%", justify="right")
            table.add_column("量比", justify="right")
            table.add_column("綜合評分", justify="center")
            
            for sid in sids:
                try:
                    res = self.analyzer.analyze(sid)
                    if "error" in res: continue
                    color = "red" if res['change_percent'] > 0 else "green"
                    table.add_row(
                        res['stock_id'], res['stock_name'], f"{res['price']}",
                        f"[{color}]{res['change_percent']}%[/{color}]", f"{res['vol_ratio']}", f"{res['total_score']}"
                    )
                except: continue
            console.print(table)
        console.input("\n按 Enter 返回主選單...")

    def show_overnight_momentum(self):
        console.print("\n[green]1.[/green] 盤中即時強勢掃描 (尋找明天開高標的)\n[green]2.[/green] 盤後籌碼大戶診斷 (分析隔日沖佔比)")
        mode = console.input("[bold yellow]請選擇 (1-2): [/bold yellow]")
        
        self.fetcher.sync_if_needed() # 確保基本行情已同步
        sids = self.fetcher.get_hot_battlefield_ids() 
        
        if not sids:
            console.print("[bold red]無法獲取熱門標的，請檢查網路或執行同步。[/bold red]")
            console.input("\n按 Enter 返回主選單...")
            return

        self.fetcher.prefetch_data(sids) 
        self.fetcher.prefetch_intraday_data(sids) # 批次同步即時行情
        
        def analyze_overnight_pro(sid):
            # get_intraday_data 現在會從 cache 讀取，因為剛才 prefetch 過了
            snapshot = self.fetcher.get_intraday_data(sid)
            if snapshot: snapshot['stock_id'] = sid
            return self.analyzer.analyze(sid, intraday_snapshot=snapshot)
        
        results = []
        bank_results = []
        
        with Progress(
            SpinnerColumn(),
            TextColumn("[progress.description]{task.description}"),
            BarColumn(),
            TaskProgressColumn(),
            console=console
        ) as progress:
            task = progress.add_task("[yellow]核心診斷中...", total=len(sids))
            with ThreadPoolExecutor(max_workers=10) as executor:
                futures = {executor.submit(analyze_overnight_pro, sid): sid for sid in sids}
                for future in futures:
                    sid = futures[future]
                    try:
                        res = future.result()
                        if res and "error" not in res:
                            if self.fetcher.is_bank(sid):
                                bank_results.append(res)
                            else:
                                results.append(res)
                    except Exception as e:
                        pass
                    progress.advance(task)
        
        if not results and not bank_results:
            console.print("[bold red]本次掃描未發現符合強勢特徵的標的。[/bold red]")
            console.input("\n按 Enter 返回主選單...")
            return
        
        if mode == "1":
            results.sort(key=lambda x: x['overnight']['score'], reverse=True)
            top = [r for r in results if r['overnight']['score'] >= 35 and not r.get('is_limit_up', False)][:25]
            
            # 備援機制：如果沒強勢股，改看「爆量股」
            if not top:
                console.print("\n[yellow]提示: 行情平淡，未發現強勢動能標的。切換至「盤中突然爆量」模式...[/yellow]")
                # 篩選有「突然爆量」訊號的標的，或是量比最高的
                top = [r for r in results if any("爆量" in s for s in r['overnight']['signals'])]
                if not top:
                    results.sort(key=lambda x: x['vol_ratio'], reverse=True)
                    top = results[:15]
                title = "盤中爆量轉強監測 (備援模式)"
            else:
                title = "隔日沖潛力 (盤中強勢, 非金融)"
                
            bank_top = sorted(bank_results, key=lambda x: x['overnight']['score'], reverse=True)[:5]
        else:
            # 如果是籌碼模式，優先看佔比
            results.sort(key=lambda x: x['overnight'].get('broker_ratio', 0), reverse=True)
            top = [r for r in results if r['overnight'].get('broker_ratio', 0) > 3][:25]
            
            # 如果沒數據 (可能券商數據受限)，則改用評分排序顯示
            if not top:
                results.sort(key=lambda x: x['overnight']['score'], reverse=True)
                top = [r for r in results if r['overnight']['score'] >= 50][:25]
                title = "隔日沖偵測 (非金融-回溯評分)"
            else:
                title = "隔日沖偵測 (非金融-籌碼佔比)"
            
            bank_top = sorted(bank_results, key=lambda x: x['overnight'].get('broker_ratio', 0), reverse=True)[:5]
            if not any(b['overnight'].get('broker_ratio', 0) > 0 for b in bank_top):
                 bank_top = sorted(bank_results, key=lambda x: x['overnight']['score'], reverse=True)[:5]

        table = Table(title=title, show_header=True, header_style="bold magenta", expand=True)
        table.add_column("標的", justify="center")
        table.add_column("價格", justify="right")
        table.add_column("漲跌%", justify="right")
        table.add_column("大戶%", justify="right")
        table.add_column("大戶成本", justify="right")
        table.add_column("評分", justify="center")
        table.add_column("診斷訊號", justify="left")
        
        for res in top:
            ov = res['overnight']
            color = "red" if res['change_percent'] > 0 else "green"
            ratio_str = f"{ov.get('broker_ratio', 0)}%" if not ov.get('restricted') else "[yellow]受限[/yellow]"
            cost_val = ov.get('broker_cost', 0)
            cost_str = f"{cost_val}" if cost_val > 0 else "N/A"
            
            # 成本警示顏色
            if cost_val > 0 and res['price'] > cost_val * 1.02:
                cost_str = f"[bold yellow]{cost_str}[/bold yellow]"
            
            table.add_row(
                f"{res['stock_id']} {res['stock_name']}", f"{res['price']}",
                f"[{color}]{res['change_percent']}%[/{color}]", ratio_str, 
                cost_str,
                f"{ov['score']}", " | ".join(ov['signals'][:3])
            )
        console.print(table)

        if bank_top:
            b_table = Table(title="金融/銀行股隔日沖監測", show_header=True, header_style="bold blue", expand=True)
            b_table.add_column("標的", justify="center")
            b_table.add_column("價格", justify="right")
            b_table.add_column("漲跌%", justify="right")
            b_table.add_column("評分", justify="center")
            b_table.add_column("診斷訊號", justify="left")
            for res in bank_top:
                ov = res['overnight']
                color = "red" if res['change_percent'] > 0 else "green"
                b_table.add_row(
                    f"{res['stock_id']} {res['stock_name']}", f"{res['price']}",
                    f"[{color}]{res['change_percent']}%[/{color}]", f"{ov['score']}",
                    " | ".join(ov['signals'][:2])
                )
            console.print(b_table)

        if any(r['overnight'].get('restricted') for r in results + bank_results):
            console.print("\n[yellow]註: 部分標的之券商分點數據受限(FinMind免費版限制)，已採用法人籌碼作為代用診斷。[/yellow]")
        console.input("\n按 Enter 返回主選單...")

    def show_etf_recommendations(self):
        sids = self.fetcher.get_popular_etf_ids()
        self.fetcher.prefetch_data(sids) 
        results = []
        with Progress(console=console) as progress:
            task = progress.add_task("[yellow]分析中...", total=len(sids))
            with ThreadPoolExecutor(max_workers=5) as executor:
                futures = {executor.submit(self.analyzer.analyze, sid): sid for sid in sids}
                for future in futures:
                    try:
                        res = future.result()
                        if "error" not in res: results.append(res)
                    except: pass
                    progress.advance(task)
        
        results.sort(key=lambda x: x['etf_rec']['score'], reverse=True)
        table = Table(title="ETF 佈局時機", show_header=True, header_style="bold magenta", expand=True)
        table.add_column("ETF", justify="center")
        table.add_column("價格", justify="right")
        table.add_column("狀態", justify="center")
        table.add_column("訊號", justify="left")
        
        for res in results:
            er = res['etf_rec']
            table.add_row(f"{res['stock_id']} {res['stock_name']}", f"{res['price']}", f"[bold]{er['status']}[/bold]", ",".join(er['signals']))
        console.print(table)
        console.input("\n按 Enter 返回主選單...")

    def show_cdp_recommendations(self):
        self.fetcher.sync_if_needed()
        console.print("[bold yellow]=== CDP 逆勢操作分析 (個股查詢) ===[/bold yellow]")
        console.print("[dim]提示：輸入股票代碼或名稱進行 CDP 當日沖銷點位計算與診斷。[/dim]")
        
        while True:
            query = console.input("\n[bold yellow]請輸入股票代碼或名稱 (0/q 返回): [/bold yellow]")
            if not query or query.lower() in ["0", "q"]: break
            
            sid = self.fetcher.resolve_stock_id(query)
            if not sid:
                console.print("[bold red]找不到該標的，請重新輸入。[/bold red]")
                continue
            
            try:
                # 取得即時報價以進行更準確的 CDP 診斷 (開盤價判斷)
                snapshot = self.fetcher.get_intraday_data(sid)
                if snapshot: snapshot['stock_id'] = sid
                
                with console.status(f"[bold yellow]CDP 分析中 {sid} ...[/bold yellow]"):
                    res = self.analyzer.analyze(sid, intraday_snapshot=snapshot)
                
                if "error" in res:
                    console.print(f"[bold red]錯誤: {res['error']}[/bold red]")
                    continue
                
                # 顯示 CDP 詳細面板
                self.display_cdp_details(res)
            except Exception as e:
                console.print(f"[bold red]分析過程中發生錯誤: {e}[/bold red]")
                continue


    def display_cdp_details(self, res):
        c = res.get('cdp', {})
        if not c:
            console.print("[red]該標的無法計算 CDP。[/red]")
            return

        color = "red" if res['change_percent'] > 0 else "green"
        base_date = c.get('base_date', '未知')
        is_preview = c.get('is_preview', False)
        
        preview_tag = " [bold magenta](隔日預覽)[/bold magenta]" if is_preview else ""
        
        header_text = f"[bold white]{res['stock_id']} {res['stock_name']}[/bold white] | 計算基準日: [bold yellow]{base_date}[/bold yellow]{preview_tag}\n"
        header_text += f"昨收: [bold white]{res['yesterday_close']}[/bold white]  |  現價: [bold {color}]{res['price']}[/bold {color}] ([{color}]{res['change_percent']}%[/{color}])"

        header = Panel(Align.center(header_text), border_style="magenta" if is_preview else color)
        
        cdp_table = Table(show_header=True, header_style="bold cyan", expand=True)
        cdp_table.add_column("價位等級", justify="center")
        cdp_table.add_column("價格點位", justify="right")
        cdp_table.add_column("操作說明", justify="left")
        
        cdp_table.add_row("[bold red]AH (最高壓力)[/bold red]", f"{c['AH']}", "追買點/極強壓力。開盤強勢突破此位代表動能極強，可考慮順勢追漲。")
        cdp_table.add_row("[yellow]NH (次高壓力)[/yellow]", f"{c['NH']}", "賣出點/近期壓力。股價漲至此位若動能減弱，為逆勢放空或獲利了結點。")
        cdp_table.add_row("[bold cyan]CDP (中樞點)[/bold cyan]", f"{c['CDP']}", "強弱分水嶺。開盤價高於此位偏多操作；低於此位偏空操作。")
        cdp_table.add_row("[yellow]NL (次低支撐)[/yellow]", f"{c['NL']}", "買進點/近期支撐。股價跌至此位若出現止跌，為逆勢買進或空單平倉點。")
        cdp_table.add_row("[bold green]AL (最低支撐)[/bold green]", f"{c['AL']}", "追賣點/極強支撐。開盤跌破此位代表走勢極弱，可考慮順勢放空。")
        
        sig_text = "\n".join([f" [yellow]![/yellow] {s}" for s in c.get('signals', [])])
        sig_p = Panel(sig_text if sig_text else "目前價格尚無觸發 CDP 特殊訊號。", title="即時 CDP 診斷", border_style="yellow")
        
        console.clear()
        console.print(self.make_header())
        console.print(header)
        console.print(cdp_table)
        console.print(sig_p)
        console.print("\n[bold cyan]CDP 操作策略提示:[/bold cyan]")
        console.print(" ● [yellow]逆勢操作[/yellow]: 股價在 NL 與 NH 之間震盪時，採高賣低買。")
        console.print(" ● [red]順勢操作[/red]: 股價突破 AH 或跌破 AL 時，採追漲殺跌。")

if __name__ == "__main__":
    dashboard = StockDashboard()
    dashboard.run()
