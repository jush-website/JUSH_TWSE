"""PTT 股板（Stock）個股討論爬蟲。

用 PTT 網頁版的標題搜尋抓近期文章（標題、推文數、日期、連結），
給前端顯示與 AI 整合分析的「市場情緒」段落使用。
任何失敗（連不上、被擋、無結果）都回傳空 list，不影響其他功能。
"""
import requests
from bs4 import BeautifulSoup

_HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
}
_COOKIES = {'over18': '1'}


def _search(query, board='Stock'):
    # PTT 偶發回 503 over-load，失敗重試一次
    for _ in range(2):
        r = requests.get(
            f'https://www.ptt.cc/bbs/{board}/search',
            params={'q': query}, headers=_HEADERS, cookies=_COOKIES, timeout=10,
        )
        if r.status_code == 200:
            break
    else:
        return []
    soup = BeautifulSoup(r.text, 'html.parser')
    posts = []
    for ent in soup.select('div.r-ent'):
        a = ent.select_one('div.title a')
        if not a:  # 已刪除的文章沒有連結
            continue
        nrec = ent.select_one('div.nrec')
        date = ent.select_one('div.date')
        posts.append({
            'title': a.text.strip(),
            'url': 'https://www.ptt.cc' + a['href'],
            'push': nrec.text.strip() if nrec else '',
            'date': date.text.strip() if date else '',
        })
    return posts


def fetch_ptt_posts(stock_id, stock_name=None, limit=15):
    """搜尋 PTT 股板中含股票代號（或名稱）的近期文章，最新在前。"""
    try:
        posts = _search(stock_id)
        # 代號搜不到什麼結果時改用名稱再搜一次（許多標題只寫公司名）
        if stock_name and len(posts) < 5:
            seen = {p['url'] for p in posts}
            posts += [p for p in _search(stock_name) if p['url'] not in seen]
        return posts[:limit]
    except Exception:
        return []
