import re

with open('src/backend/web_app.py', 'r', encoding='utf-8') as f:
    code = f.read()

# Replace the background_strategies_sync completely
new_sync_code = """
async def background_strategies_sync():
    # 記錄當天的同步狀態
    sync_status = {
        "date": None,
        "stage1_done": False,
        "stage2_done": False,
        "stage3_done": False,
        "stage4_done": False
    }

    await asyncio.sleep(15)
    
    while True:
        try:
            now = datetime.now(pytz.timezone("Asia/Taipei"))
            today_str = now.strftime("%Y-%m-%d")
            
            if sync_status["date"] != today_str:
                sync_status["date"] = today_str
                sync_status["stage1_done"] = False
                sync_status["stage2_done"] = False
                sync_status["stage3_done"] = False
                sync_status["stage4_done"] = False

            time_int = now.hour * 100 + now.minute
            
            def update_doc(doc_id, data_list):
                if firebase_db:
                    base_date = fetcher.get_last_expected_trading_date().strftime("%Y-%m-%d")
                    doc_ref = firebase_db.collection('recommendations').document(doc_id)
                    doc_ref.set({
                        'data': data_list,
                        'base_date': base_date,
                        'updated_at': firestore.SERVER_TIMESTAMP
                    })

            loop = asyncio.get_event_loop()
            executed_any = False

            if time_int >= 1430 and not sync_status["stage1_done"]:
                print(f"[系統] 執行階段一同歩 (14:30後): 價格與大盤資料")
                hot_stocks = await get_hot_stocks(force=True)
                await loop.run_in_executor(None, update_doc, 'hot_stocks', hot_stocks)
                etf = await get_etf_recommendations(force=True)
                await loop.run_in_executor(None, update_doc, 'etf', etf)
                capital_flow = await get_capital_flow_recommendations(force=True)
                await loop.run_in_executor(None, update_doc, 'capital_flow', capital_flow)
                sync_status["stage1_done"] = True
                executed_any = True
                print("[系統] 階段一同歩完成")

            elif time_int >= 1630 and not sync_status["stage2_done"]:
                print(f"[系統] 執行階段二同歩 (16:30後): 法人買賣超與初步策略")
                try:
                    institutional_flow = await loop.run_in_executor(None, fetcher.get_institutional_flow, 30)
                    await loop.run_in_executor(None, update_doc, 'institutional_flow', institutional_flow)
                except Exception as e:
                    print(f"[系統] 同步 institutional_flow 失敗: {e}")
                
                short_term_burst = await get_short_term_burst_recommendations(force=True)
                await loop.run_in_executor(None, update_doc, 'short_term_burst', short_term_burst)
                sync_status["stage2_done"] = True
                executed_any = True
                print("[系統] 階段二同歩完成")

            elif time_int >= 1800 and not sync_status["stage3_done"]:
                print(f"[系統] 執行階段三同歩 (18:00後): 主力分點資料")
                short_term = await get_short_term_recommendations(force=True)
                await loop.run_in_executor(None, update_doc, 'short_term', short_term)
                overnight_1 = await get_overnight_recommendations(mode="1", force=True)
                await loop.run_in_executor(None, update_doc, 'overnight_1', overnight_1)
                sync_status["stage3_done"] = True
                executed_any = True
                print("[系統] 階段三同歩完成")

            elif time_int >= 2100 and not sync_status["stage4_done"]:
                print(f"[系統] 執行階段四同歩 (21:00後): 融資券與全策略總結算")
                long_term = await get_long_term_recommendations(force=True)
                await loop.run_in_executor(None, update_doc, 'long_term', long_term)
                bottom_fishing = await get_bottom_fishing_recommendations(force=True)
                await loop.run_in_executor(None, update_doc, 'bottom_fishing', bottom_fishing)
                overnight_2 = await get_overnight_recommendations(mode="2", force=True)
                await loop.run_in_executor(None, update_doc, 'overnight_2', overnight_2)
                cdp = await get_cdp_recommendations(force=True)
                await loop.run_in_executor(None, update_doc, 'cdp', cdp)
                try:
                    day_trade_cdp = await get_day_trade_cdp_recommendations(force=True)
                    await loop.run_in_executor(None, update_doc, 'day_trade_cdp', day_trade_cdp)
                except: pass
                sync_status["stage4_done"] = True
                executed_any = True
                print("[系統] 階段四同歩完成")
            
            if executed_any:
                import gc
                gc.collect()
            
            # 每 10 分鐘檢查一次狀態
            await asyncio.sleep(600)
                
        except asyncio.CancelledError:
            return
        except Exception as e:
            print(f"[系統] 背景策略分析與同步錯誤: {e}")
            await asyncio.sleep(600)
"""

code = re.sub(r'async def background_strategies_sync\(\):.*?(?=\nasync def |$)', new_sync_code + '\n', code, flags=re.DOTALL)

with open('src/backend/web_app.py', 'w', encoding='utf-8') as f:
    f.write(code)

print("Background strategies sync patched.")
