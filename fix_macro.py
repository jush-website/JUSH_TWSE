import re

path = 'src/pages/MacroDashboard.jsx'
with open(path, 'r', encoding='utf-8') as f:
    text = f.read()

# Remove early return
text = text.replace('  if (loading) return <ProgressLoader text="正在載入總體經濟數據..." />;\n\n', '')

# Modify return statement to wrap content in a conditional
orig_return = """  return (
    <div ref={containerRef} className="space-y-6 max-w-7xl mx-auto pb-12">
      <div className="flex items-center space-x-3 mb-6">
        <Globe className="text-blue-400 w-8 h-8" />
        <h1 className="text-2xl sm:text-3xl font-black text-white">總體經濟儀表板</h1>
      </div>"""

new_return = """  return (
    <div ref={containerRef} className="space-y-6 max-w-7xl mx-auto pb-12">
      <div className="flex items-center space-x-3 mb-6">
        <Globe className="text-blue-400 w-8 h-8" />
        <h1 className="text-2xl sm:text-3xl font-black text-white">總體經濟儀表板</h1>
      </div>
      
      {loading ? (
        <ProgressLoader text="正在載入總體經濟數據..." />
      ) : (
        <>"""

text = text.replace(orig_return, new_return)

text = text.rsplit('</div>', 1)
text = text[0] + '        </>\n      )}\n    </div>'

with open(path, 'w', encoding='utf-8') as f:
    f.write(text)

print("Fixed MacroDashboard")
