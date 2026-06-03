import re

path = r"c:\Users\minar\OneDrive - 國立屏東科技大學\文件\GitHub\JUSH_TWSE\src\frontend\pages\StockAnalysis.jsx"
with open(path, "r", encoding="utf-8") as f:
    content = f.read()

# Replace all margin={{ top: 5, right: 0, left: -20, bottom: 0 }}
# To margin={{ top: 10, right: 35, left: 35, bottom: 0 }}
# We can use regex to catch variations of whitespace.
pattern = r"margin=\{\{\s*top:\s*5,\s*right:\s*0,\s*left:\s*-20,\s*bottom:\s*0\s*\}\}"
replacement = "margin={{ top: 10, right: 35, left: 35, bottom: 0 }}"

content = re.sub(pattern, replacement, content)

# I should also add a formatter for YAxis if needed, but increasing margin is usually enough and much simpler.
# Let's also check if there are other similar margins.
pattern2 = r"margin=\{\{\s*top:\s*5,\s*right:\s*0,\s*left:\s*-10,\s*bottom:\s*0\s*\}\}"
content = re.sub(pattern2, replacement, content)

with open(path, "w", encoding="utf-8") as f:
    f.write(content)

print("Updated margins successfully.")
