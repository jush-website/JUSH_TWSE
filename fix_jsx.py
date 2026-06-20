import os
file_path = 'src/pages/StockAnalysis.jsx'
with open(file_path, 'r', encoding='utf-8') as f:
    text = f.read()

text = text.replace('className=\\"gsap-tab-content', 'className="gsap-tab-content')

with open(file_path, 'w', encoding='utf-8') as f:
    f.write(text)

print('Fixed JSX escape strings')
