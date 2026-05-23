import requests
import re
res = requests.get('https://tw.stock.yahoo.com/quote/WTX%26', headers={'User-Agent': 'Mozilla/5.0'})
price_match = re.search(r'"regularMarketPrice"\s*:\s*(?:\{.*?"raw"\s*:\s*"?|"?|)(\d+(?:\.\d+)?)', res.text)
prev_match = re.search(r'"regularMarketPreviousClose"\s*:\s*(?:\{.*?"raw"\s*:\s*"?|"?|)(\d+(?:\.\d+)?)', res.text)
print(price_match.group(1) if price_match else None)
print(prev_match.group(1) if prev_match else None)
