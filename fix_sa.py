file_path = 'src/pages/StockAnalysis.jsx'
with open(file_path, 'r', encoding='utf-8') as f:
    text = f.read()

text = text.replace('transition-all duration-500', 'transition-colors duration-500')

with open(file_path, 'w', encoding='utf-8') as f:
    f.write(text)

print('Fixed StockAnalysis transition')
