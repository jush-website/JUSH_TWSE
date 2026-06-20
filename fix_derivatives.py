import re

path = 'src/pages/Derivatives.jsx'
with open(path, 'r', encoding='utf-8') as f:
    text = f.read()

# Remove early return
text = text.replace('  if (loading) return <ProgressLoader text="正在載入期權籌碼數據..." />;\n\n', '')

# Modify return statement to wrap content in a conditional
orig_return = """  return (
    <div ref={containerRef} className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <div className="flex items-center space-x-3 mb-2">
            <div className="p-2 bg-blue-500/20 rounded-lg">
              <Activity className="text-blue-400 w-6 h-6" />
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-purple-400">
              期權籌碼分析
            </h1>
          </div>
          <p className="text-gray-400 text-sm">
            追蹤台股大盤期貨與選擇權主力動向，掌握波段趨勢轉折。
          </p>
        </div>
        {latest && (
          <div className="text-xs text-gray-400 bg-gray-800/50 px-3 py-1.5 rounded-full border border-gray-700/50">
            最新資料：{latest.date}
          </div>
        )}
      </div>"""

new_return = """  return (
    <div ref={containerRef} className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <div className="flex items-center space-x-3 mb-2">
            <div className="p-2 bg-blue-500/20 rounded-lg">
              <Activity className="text-blue-400 w-6 h-6" />
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-purple-400">
              期權籌碼分析
            </h1>
          </div>
          <p className="text-gray-400 text-sm">
            追蹤台股大盤期貨與選擇權主力動向，掌握波段趨勢轉折。
          </p>
        </div>
        {latest && !loading && (
          <div className="text-xs text-gray-400 bg-gray-800/50 px-3 py-1.5 rounded-full border border-gray-700/50">
            最新資料：{latest.date}
          </div>
        )}
      </div>

      {loading ? (
        <ProgressLoader text="正在載入期權籌碼數據..." />
      ) : (
        <>"""

text = text.replace(orig_return, new_return)

# Add closing tag for the fragment at the end of the file
# We'll just replace the last closing div
text = text.rsplit('</div>', 1)
text = text[0] + '        </>\n      )}\n    </div>'

with open(path, 'w', encoding='utf-8') as f:
    f.write(text)

print("Fixed Derivatives")
