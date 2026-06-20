import re
import os

# Fix StockAnalysis.jsx
file_path = "src/pages/StockAnalysis.jsx"
with open(file_path, "r", encoding="utf-8") as f:
    text = f.read()

text = re.sub(
    r'<div className="h-\[280px\] sm:h-\[300px\] w-full\">\s*<ResponsiveContainer width=\"100%\" height=\"100%\">',
    '<div className="w-full overflow-x-auto pb-2 custom-scrollbar">\n                      <div style={{ minWidth: 700 }} className="h-[280px] sm:h-[300px]">\n                        <ResponsiveContainer width="100%" height="100%">',
    text
)

text = re.sub(
    r'</ResponsiveContainer>\s*</div>\s*</div>',
    '</ResponsiveContainer>\n                      </div>\n                    </div>\n                  </div>',
    text
)

with open(file_path, "w", encoding="utf-8") as f:
    f.write(text)

# Fix BranchAnalysis.jsx
file_path2 = "src/components/BranchAnalysis.jsx"
with open(file_path2, "r", encoding="utf-8") as f:
    text2 = f.read()

text2 = re.sub(
    r'<table className="w-full text-sm text-left text-gray-300">',
    '<table style={{ minWidth: 500 }} className="w-full text-sm text-left text-gray-300">',
    text2
)

with open(file_path2, "w", encoding="utf-8") as f:
    f.write(text2)

print("Replaced successfully")
