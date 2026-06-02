import urllib.request
import json
import ssl
from bs4 import BeautifulSoup

def get_yahoo_capital_flow():
    ctx = ssl.create_default_context()
    ctx.check_hostname = False
    ctx.verify_mode = ssl.CERT_NONE
    
    # Try fetching Yahoo TW Class quote HTML
    url = "https://tw.stock.yahoo.com/class"
    req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
    try:
        html = urllib.request.urlopen(req, context=ctx).read().decode('utf-8')
        soup = BeautifulSoup(html, 'html.parser')
        
        # Yahoo finance uses a React app and embeds data in a script tag
        script = soup.find('script', text=lambda t: t and 'window.__INITIAL_STATE__' in t)
        if script:
            js_code = script.string
            # extract JSON
            json_str = js_code.split('window.__INITIAL_STATE__ = ')[1].split(';')[0]
            data = json.loads(json_str)
            print("Successfully extracted state!")
            return
        
        # If not, let's just parse the HTML rows
        print("Parsing HTML rows...")
        rows = soup.find_all('li', class_='List(n)')
        for r in rows[:5]:
            print(r.text)
            
    except Exception as e:
        print("Error:", e)

get_yahoo_capital_flow()
