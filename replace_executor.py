import re

with open('src/backend/web_app.py', 'r', encoding='utf-8') as f:
    content = f.read()

# Replace executor with bg_executor in recommendation routes
routes_to_bg = [
    'get_long_term_recommendations',
    'get_hot_stocks',
    'get_short_term_recommendations',
    'get_bottom_fishing_recommendations',
    'get_short_term_burst_recommendations',
    'get_day_trade_cdp_recommendations',
    'get_overnight_recommendations',
    'get_etf_recommendations',
    'get_capital_flow_recommendations'
]

# We need to selectively replace `executor` with `bg_executor` inside these functions,
# and `api_executor` inside `analyze_stock`, `get_raw_data`, `analyze_custom`, `proxy_finmind`.
# It's easier to just replace all `executor` with `bg_executor`, then change back for specific ones.

content = content.replace('loop.run_in_executor(executor', 'loop.run_in_executor(bg_executor')

content = content.replace('def analyze_custom', 'def analyze_custom') # anchor
content = re.sub(r'(def analyze_custom.*?)bg_executor', r'\1api_executor', content, flags=re.DOTALL)

def replace_in_func(func_name, code):
    pattern = rf'(def {func_name}\(.*?:.*?)(def |@app\.|$)'
    def repl(m):
        return m.group(1).replace('bg_executor', 'api_executor') + m.group(2)
    return re.sub(pattern, repl, code, flags=re.DOTALL)

content = replace_in_func('analyze_stock', content)
content = replace_in_func('get_raw_data', content)
content = replace_in_func('analyze_custom', content)
content = replace_in_func('proxy_finmind', content)

with open('src/backend/web_app.py', 'w', encoding='utf-8') as f:
    f.write(content)

print("Replacement done.")
