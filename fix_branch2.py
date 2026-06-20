file_path = "src/components/BranchAnalysis.jsx"
with open(file_path, "r", encoding="utf-8") as f:
    text = f.read()

text = text.replace('className="w-full min-w-[500px] text-sm text-left text-gray-300"', 'style={{ minWidth: 500 }} className="w-full text-sm text-left text-gray-300"')

with open(file_path, "w", encoding="utf-8") as f:
    f.write(text)

print("Branch table updated")
