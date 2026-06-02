import requests
res = requests.get('https://stock-analysis-v5-52q2.onrender.com/api/raw-data/2330')
print('Status:', res.status_code)
data = res.json()
print('PER Length:', len(data.get('per_data', [])))
