import os

def fix_file(filepath, loader_text, title_icon, title_text, desc_text):
    with open(filepath, 'r', encoding='utf-8') as f:
        text = f.read()

    # 1. Remove early return
    early_return = f'  if (loading) return <ProgressLoader text="{loader_text}" />;\n'
    text = text.replace(early_return, '')

    # 2. Modify return
    if 'Derivatives.jsx' in filepath:
        orig_return = """  return (
    <div ref={containerRef} className="space-y-6">"""
        new_return = f"""  return (
    <div ref={{containerRef}} className="space-y-6">
      {{loading ? (
        <ProgressLoader text="{loader_text}" />
      ) : (
        <>"""
        text = text.replace(orig_return, new_return)
        
        # Replace the last </div>
        idx = text.rfind('</div>')
        if idx != -1:
            text = text[:idx] + '        </>\n      )}\n    </div>' + text[idx+6:]

    elif 'MacroDashboard.jsx' in filepath:
        orig_return = """  return (
    <div ref={containerRef} className="space-y-6 max-w-7xl mx-auto pb-12">"""
        new_return = f"""  return (
    <div ref={{containerRef}} className="space-y-6 max-w-7xl mx-auto pb-12">
      {{loading ? (
        <ProgressLoader text="{loader_text}" />
      ) : (
        <>"""
        text = text.replace(orig_return, new_return)

        # Replace the last </div>
        idx = text.rfind('</div>')
        if idx != -1:
            text = text[:idx] + '        </>\n      )}\n    </div>' + text[idx+6:]

    with open(filepath, 'w', encoding='utf-8') as f:
        f.write(text)

fix_file('src/pages/Derivatives.jsx', '正在載入期權籌碼數據...', '', '', '')
fix_file('src/pages/MacroDashboard.jsx', '正在載入總體經濟數據...', '', '', '')

print("Fixed correctly")
