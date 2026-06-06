import json

with open('tools.json', encoding='utf-8') as f:
    data = json.load(f)

result = []
for t in data.get('tools', []):
    name = t.get('name', '')
    desc = t.get('description', '')
    # Check for broader stock/finance keywords
    keywords = ['股', '證', '財報', '營收', '配息', '除權', '台股', '上市', '上櫃', '公司', '法人', '外資', '金融', '經濟']
    if any(k in name.lower() for k in ['stock', 'twse', 'tpex', 'finance']) or \
       any(k in desc for k in keywords):
        result.append(f"[{name}]")
        result.append(desc.splitlines()[0] if desc else '')
        result.append(desc)
        result.append("-" * 40)

with open('stock_tools.txt', 'w', encoding='utf-8') as f:
    f.write('\n'.join(result))
