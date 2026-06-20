import os

file_path = "src/components/BranchAnalysis.jsx"
with open(file_path, "r", encoding="utf-8") as f:
    content = f.read()

old_str = """<div className="overflow-x-auto">
              <table className="w-full text-sm text-left text-gray-300">"""

new_str = """<div className="overflow-x-auto pb-2 custom-scrollbar">
              <table className="w-full min-w-[500px] text-sm text-left text-gray-300">"""

content = content.replace(old_str, new_str)

with open(file_path, "w", encoding="utf-8") as f:
    f.write(content)

print("BranchAnalysis Replacement done!")
