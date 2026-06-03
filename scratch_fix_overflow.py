import re

path = r"c:\Users\minar\OneDrive - 國立屏東科技大學\文件\GitHub\JUSH_TWSE\src\frontend\pages\StockAnalysis.jsx"
with open(path, "r", encoding="utf-8") as f:
    content = f.read()

# I will replace `<ResponsiveContainer width="100%" height="100%">` that are inside `h-[400px]` with a wrapped version.
# Actually, the simplest string replacement is to find `<ResponsiveContainer width="100%" height="100%">` and wrap it if it's not already wrapped.
# But it's easier to use a regex to find the blocks.

blocks_to_replace = [
    # 1. 三大法人買賣超
    (r'<h2 className="text-lg font-bold text-gray-300 mb-4">三大法人買賣超 \(張\)</h2>\s*<ResponsiveContainer width="100%" height="100%">',
     '<h2 className="text-lg font-bold text-gray-300 mb-4">三大法人買賣超 (張)</h2>\n                  <div className="h-[300px] sm:h-[320px] w-full">\n                    <ResponsiveContainer width="100%" height="100%">'),
    
    # 2. 融資融券餘額
    (r'<h2 className="text-lg font-bold text-gray-300 mb-4">融資融券餘額 \(張\)</h2>\s*<ResponsiveContainer width="100%" height="100%">',
     '<h2 className="text-lg font-bold text-gray-300 mb-4">融資融券餘額 (張)</h2>\n                  <div className="h-[300px] sm:h-[320px] w-full">\n                    <ResponsiveContainer width="100%" height="100%">'),
    
    # 3. 外資持股比例
    (r'<h2 className="text-lg font-bold text-gray-300 mb-4">外資持股比例 \(%\)</h2>\s*<ResponsiveContainer width="100%" height="100%">',
     '<h2 className="text-lg font-bold text-gray-300 mb-4">外資持股比例 (%)</h2>\n                  <div className="h-[300px] sm:h-[320px] w-full">\n                    <ResponsiveContainer width="100%" height="100%">'),
    
    # 4. 月營收與年增率
    (r'<h2 className="text-lg font-bold text-gray-300 mb-4">月營收與年增率</h2>\s*<ResponsiveContainer width="100%" height="100%">',
     '<h2 className="text-lg font-bold text-gray-300 mb-4">月營收與年增率</h2>\n                  <div className="h-[300px] sm:h-[320px] w-full">\n                    <ResponsiveContainer width="100%" height="100%">'),
    
    # 5. 每股盈餘 (EPS)
    (r'<h2 className="text-lg font-bold text-gray-300 mb-4">每股盈餘 \(EPS\)</h2>\s*<ResponsiveContainer width="100%" height="100%">',
     '<h2 className="text-lg font-bold text-gray-300 mb-4">每股盈餘 (EPS)</h2>\n                  <div className="h-[300px] sm:h-[320px] w-full">\n                    <ResponsiveContainer width="100%" height="100%">'),
]

for pattern, replacement in blocks_to_replace:
    content = re.sub(pattern, replacement, content)

# Now we need to close the `</div>` for these wrappers.
# I can just replace `</ResponsiveContainer>\n                </div>` with `</ResponsiveContainer>\n                  </div>\n                </div>`
# Wait, let's be careful. Let's just find the closing tags of ResponsiveContainer and add a `</div>` after them.
# BUT I don't want to add it to charts that already had a wrapper (like Price & Volume, MACD).
# Those existing charts have:
# <div className="h-[250px] sm:h-[260px] w-full">
#   <ResponsiveContainer ...> ... </ResponsiveContainer>
# </div>
# </div>

content = re.sub(r'(</ResponsiveContainer>\s*</div>\s*)\{/\* 資券變化 \*/\}', r'</ResponsiveContainer>\n                  </div>\n                </div>\n              {/* 資券變化 */}', content)
content = re.sub(r'(</ResponsiveContainer>\s*</div>\s*)\{/\* 外資持股比例 \*/\}', r'</ResponsiveContainer>\n                  </div>\n                </div>\n              {/* 外資持股比例 */}', content)
content = re.sub(r'(</ResponsiveContainer>\s*</div>\s*)\{/\* EPS \*/\}', r'</ResponsiveContainer>\n                  </div>\n                </div>\n              {/* EPS */}', content)
content = re.sub(r'(</ResponsiveContainer>\s*</div>\s*)\{/\* 財報 Table \*/\}', r'</ResponsiveContainer>\n                  </div>\n                </div>\n              {/* 財報 Table */}', content)

# For the last one in `chips` tab (外資持股比例) and `fundamentals` tab (EPS):
content = re.sub(r'(</ResponsiveContainer>\s*</div>\s*</div>\s*)\}', r'</ResponsiveContainer>\n                  </div>\n                </div>\n            </div>\n          )}', content)
# Wait, this regex might be too dangerous. Let's write a safer parser or just replace the whole file section.
