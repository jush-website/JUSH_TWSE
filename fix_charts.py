import os

file_path = "src/pages/StockAnalysis.jsx"
with open(file_path, "r", encoding="utf-8") as f:
    content = f.read()

# Replace the wrapper div
old_str1 = """                    <div className="h-[280px] sm:h-[300px] w-full">
                      <ResponsiveContainer width="100%" height="100%">"""
new_str1 = """                    <div className="w-full overflow-x-auto pb-2 custom-scrollbar">
                      <div className="h-[280px] sm:h-[300px] min-w-[700px]">
                        <ResponsiveContainer width="100%" height="100%">"""
content = content.replace(old_str1, new_str1)

old_str2 = """                      </ResponsiveContainer>
                    </div>
                  </div>"""
new_str2 = """                        </ResponsiveContainer>
                      </div>
                    </div>
                  </div>"""
content = content.replace(old_str2, new_str2)

with open(file_path, "w", encoding="utf-8") as f:
    f.write(content)

print("Replacement done!")
