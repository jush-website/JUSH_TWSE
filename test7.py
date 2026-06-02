import requests
res = requests.get('https://stock-analysis-v5-52q2.onrender.com/api/raw-data/2330')
print('Status:', res.status_code)
print('Body:', res.text)
