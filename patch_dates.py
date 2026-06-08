import re

with open('src/services/api.js', 'r', encoding='utf-8') as f:
    code = f.read()

# Replace fetchFromFirestore updatedAtStr logic
new_fetch = """      const dateObj = typeof firestoreData.updated_at.toDate === 'function' 
        ? firestoreData.updated_at.toDate() 
        : new Date(firestoreData.updated_at);
      const timeStr = dateObj.toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit' });
      // If base_date exists, show it along with time, else show full date
      if (firestoreData.base_date) {
        updatedAtStr = `${firestoreData.base_date} ${timeStr}`;
      } else {
        updatedAtStr = `${dateObj.toLocaleDateString('zh-TW')} ${timeStr}`;
      }"""

code = re.sub(
    r"const dateObj = typeof firestoreData\.updated_at\.toDate.*?updatedAtStr = dateObj\.toLocaleTimeString\('zh-TW', \{ hour: '2-digit', minute: '2-digit' \}\);",
    new_fetch,
    code,
    flags=re.DOTALL
)

# For the api.get fallbacks that use new Date().toLocaleTimeString
fallback_repl = "new Date().toLocaleDateString('zh-TW') + ' ' + new Date().toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit' })"
code = code.replace("new Date().toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit' })", fallback_repl)

with open('src/services/api.js', 'w', encoding='utf-8') as f:
    f.write(code)

print("Patched api.js")

with open('src/pages/InstitutionalFlow.jsx', 'r', encoding='utf-8') as f:
    flow = f.read()

# latestData.date is like "2026-06-05 00:00:00" -> format it to "2026-06-05"
flow = flow.replace("{latestData.date}", "{latestData.date ? latestData.date.split(' ')[0] : ''}")

# Fix XAxis tooltip for InstitutionalFlow
flow = flow.replace(
    "tickFormatter={(val) => (val / 100000000).toFixed(0) + '億'}",
    "tickFormatter={(val) => (val / 100000000).toFixed(0) + '億'}"
)

# Wait, XAxis date tick formatting! Currently XAxis is dateKey="date"
flow = flow.replace(
    '<XAxis dataKey="date"',
    '<XAxis dataKey="date" tickFormatter={(val) => val ? val.split(" ")[0] : ""}'
)

with open('src/pages/InstitutionalFlow.jsx', 'w', encoding='utf-8') as f:
    f.write(flow)

print("Patched InstitutionalFlow.jsx")
