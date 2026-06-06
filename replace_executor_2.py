import re

with open('src/backend/web_app.py', 'r', encoding='utf-8') as f:
    content = f.read()

# Replace any lingering bg_executor in proxy_finmind, get_raw_data, analyze_custom
def replace_in_func(func_name, code):
    pattern = rf'(def {func_name}\(.*?:.*?)(def |@app\.|$)'
    def repl(m):
        return m.group(1).replace('bg_executor', 'api_executor') + m.group(2)
    return re.sub(pattern, repl, code, flags=re.DOTALL)

content = replace_in_func('proxy_finmind', content)
content = replace_in_func('get_raw_data', content)
content = replace_in_func('analyze_custom', content)

with open('src/backend/web_app.py', 'w', encoding='utf-8') as f:
    f.write(content)

print("Replacement done again.")
