import requests
import asyncio
from typing import Optional

_registry_cache = {}

def load_company_registry():
    global _registry_cache
    if _registry_cache:
        return

    # 上市公司
    try:
        res_l = requests.get('https://openapi.twse.com.tw/v1/opendata/t187ap03_L', timeout=10)
        if res_l.status_code == 200:
            for item in res_l.json():
                if "公司代號" in item and "營利事業統一編號" in item:
                    _registry_cache[item["公司代號"]] = item["營利事業統一編號"]
    except Exception as e:
        print(f"載入上市公司統編資料失敗: {e}")

    # 上櫃公司
    try:
        res_o = requests.get('https://openapi.tpex.org.tw/v1/opendata/t187ap03_O', timeout=10)
        if res_o.status_code == 200:
            for item in res_o.json():
                if "公司代號" in item and "營利事業統一編號" in item:
                    _registry_cache[item["公司代號"]] = item["營利事業統一編號"]
    except Exception as e:
        print(f"載入上櫃公司統編資料失敗: {e}")
        
    print(f"[系統] 成功載入 {len(_registry_cache)} 筆公司統編對應資料")

def get_tax_id(stock_id: str) -> Optional[str]:
    if not _registry_cache:
        load_company_registry()
    return _registry_cache.get(stock_id)
