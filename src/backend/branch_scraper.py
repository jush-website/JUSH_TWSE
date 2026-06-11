import requests
from bs4 import BeautifulSoup

def fetch_branch_data(stock_id: str):
    """
    從公開網站抓取個股的分點進出資料 (前 15 大買超/賣超分點)
    回傳格式:
    {
        "buy_branches": [{"name": "券商A", "net_buy": 1000, "price": 100.5}, ...],
        "sell_branches": [{"name": "券商B", "net_buy": -500, "price": 101.0}, ...]
    }
    """
    url = f"https://histock.tw/stock/branch.aspx?no={stock_id}"
    headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    }
    
    try:
        r = requests.get(url, headers=headers, timeout=10)
        # HiStock 的頁面編碼通常是 utf-8，保險起見自動偵測
        r.encoding = r.apparent_encoding if r.encoding == 'ISO-8859-1' else r.encoding
        
        soup = BeautifulSoup(r.text, 'html.parser')
        table = soup.find('table')
        if not table:
            return None
            
        rows = table.find_all('tr')
        if len(rows) < 2:
            return None
            
        buy_branches = []
        sell_branches = []
        
        for row in rows[1:]: # Skip header
            cols = row.find_all(['th', 'td'])
            if len(cols) >= 10:
                # 賣超部分 (左側)
                sell_name = cols[0].text.strip()
                sell_net_str = cols[3].text.strip().replace(',', '')
                sell_price_str = cols[4].text.strip()
                
                if sell_name and sell_net_str.lstrip('-').replace('.', '').isdigit():
                    sell_branches.append({
                        "name": sell_name,
                        "net_buy": int(float(sell_net_str)),
                        "price": float(sell_price_str) if sell_price_str.replace('.', '').isdigit() else 0
                    })
                    
                # 買超部分 (右側)
                buy_name = cols[5].text.strip()
                buy_net_str = cols[8].text.strip().replace(',', '')
                buy_price_str = cols[9].text.strip()
                
                if buy_name and buy_net_str.lstrip('-').replace('.', '').isdigit():
                    buy_branches.append({
                        "name": buy_name,
                        "net_buy": int(float(buy_net_str)),
                        "price": float(buy_price_str) if buy_price_str.replace('.', '').isdigit() else 0
                    })
                    
        return {
            "buy_branches": buy_branches,
            "sell_branches": sell_branches
        }
    except Exception as e:
        print(f"Fetch branch data error for {stock_id}: {e}")
        return None
