import re

with open('src/frontend/pages/StockAnalysis.jsx', 'r', encoding='utf-8') as f:
    content = f.read()

# 1. Add Area to recharts import
content = content.replace("Cell\n} from 'recharts';", "Cell, Area\n} from 'recharts';")
content = content.replace("Cell } from 'recharts';", "Cell, Area } from 'recharts';")

# 2. Upgrade container styles
old_container = 'bg-gray-800 rounded-2xl border border-gray-700 p-4 sm:p-6 shadow-xl'
new_container = 'bg-gray-800/80 backdrop-blur-xl rounded-2xl border border-gray-700/50 p-4 sm:p-6 shadow-2xl hover:border-blue-500/30 transition-all duration-500'
content = content.replace(old_container, new_container)

# 3. Upgrade Tooltip
old_tooltip = "contentStyle={{ backgroundColor: '#1F2937', borderColor: '#374151', color: '#fff' }}"
new_tooltip = "contentStyle={{ backgroundColor: 'rgba(17, 24, 39, 0.8)', backdropFilter: 'blur(8px)', borderColor: '#374151', color: '#fff', borderRadius: '12px', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.5)' }} cursor={{fill: 'rgba(255,255,255,0.05)'}}"
content = content.replace(old_tooltip, new_tooltip)

# 4. Add cool defs to ComposedChart
defs_html = """
                      <defs>
                        <linearGradient id="colorClose" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#3B82F6" stopOpacity={0.3}/>
                          <stop offset="95%" stopColor="#3B82F6" stopOpacity={0}/>
                        </linearGradient>
                        <linearGradient id="colorVol" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#6B7280" stopOpacity={0.5}/>
                          <stop offset="95%" stopColor="#6B7280" stopOpacity={0.1}/>
                        </linearGradient>
                        <linearGradient id="colorMargin" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#F87171" stopOpacity={0.3}/>
                          <stop offset="95%" stopColor="#F87171" stopOpacity={0}/>
                        </linearGradient>
                        <linearGradient id="colorShort" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#60A5FA" stopOpacity={0.3}/>
                          <stop offset="95%" stopColor="#60A5FA" stopOpacity={0}/>
                        </linearGradient>
                        <linearGradient id="colorRatio" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#A78BFA" stopOpacity={0.3}/>
                          <stop offset="95%" stopColor="#A78BFA" stopOpacity={0}/>
                        </linearGradient>
                        <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
                          <feGaussianBlur stdDeviation="2" result="blur" />
                          <feComposite in="SourceGraphic" in2="blur" operator="over" />
                        </filter>
                      </defs>
"""
# Inject defs right before CartesianGrid
content = content.replace('<CartesianGrid ', defs_html + '<CartesianGrid ')

# 5. Price & Volume Chart Updates
content = content.replace(
    '<Line yAxisId="left" type="monotone" dataKey="close" name="收盤價" stroke="#3B82F6" strokeWidth={2} dot={false} />',
    '<Area yAxisId="left" type="monotone" dataKey="close" name="收盤價" stroke="#3B82F6" strokeWidth={3} fillOpacity={1} fill="url(#colorClose)" activeDot={{ r: 6, strokeWidth: 0, fill: "#60A5FA", filter: "url(#glow)" }} />'
)
content = content.replace(
    '<Bar yAxisId="right" dataKey="volume" name="成交量(張)" fill="#4B5563" opacity={0.6} />',
    '<Bar yAxisId="right" dataKey="volume" name="成交量(張)" fill="url(#colorVol)" radius={[4, 4, 0, 0]} />'
)

# 6. MACD Updates
content = content.replace(
    '<Line type="monotone" dataKey="macd_line" name="DIF(快線)" stroke="#F59E0B" strokeWidth={1.5} dot={false} />',
    '<Line type="monotone" dataKey="macd_line" name="DIF(快線)" stroke="#FBBF24" strokeWidth={2.5} dot={false} filter="url(#glow)" />'
)
content = content.replace(
    '<Line type="monotone" dataKey="macd_signal" name="DEA(慢線)" stroke="#8B5CF6" strokeWidth={1.5} dot={false} />',
    '<Line type="monotone" dataKey="macd_signal" name="DEA(慢線)" stroke="#C084FC" strokeWidth={2.5} dot={false} filter="url(#glow)" />'
)
# Modify MACD Bar Cell colors for cooler neon look
content = content.replace(
    "<Cell key={`cell-${index}`} fill={entry.macd_hist > 0 ? '#EF4444' : '#10B981'} />",
    "<Cell key={`cell-${index}`} fill={entry.macd_hist > 0 ? '#F87171' : '#34D399'} fillOpacity={0.8} />"
)
content = content.replace(
    '<Bar dataKey="macd_hist" name="MACD柱狀">',
    '<Bar dataKey="macd_hist" name="MACD柱狀" radius={[2, 2, 2, 2]}>'
)

# 7. Chips Tab Updates
# 法人買賣超
content = content.replace(
    '<Bar dataKey="foreign_net" name="外資買賣超" fill="#3B82F6" opacity={0.8} />',
    '<Bar dataKey="foreign_net" name="外資買賣超" fill="#3B82F6" opacity={0.85} radius={[2, 2, 0, 0]} />'
)
content = content.replace(
    '<Bar dataKey="trust_net" name="投信買賣超" fill="#F59E0B" opacity={0.8} />',
    '<Bar dataKey="trust_net" name="投信買賣超" fill="#FBBF24" opacity={0.85} radius={[2, 2, 0, 0]} />'
)
# 資券變化
content = content.replace(
    '<Line yAxisId="left" type="monotone" dataKey="margin_bal" name="融資餘額" stroke="#F87171" dot={false} strokeWidth={2} />',
    '<Area yAxisId="left" type="monotone" dataKey="margin_bal" name="融資餘額" stroke="#F87171" strokeWidth={2.5} fillOpacity={1} fill="url(#colorMargin)" activeDot={{ r: 5, strokeWidth: 0, fill: "#FCA5A5", filter: "url(#glow)" }} />'
)
content = content.replace(
    '<Line yAxisId="right" type="monotone" dataKey="short_bal" name="融券餘額" stroke="#60A5FA" dot={false} strokeWidth={2} />',
    '<Area yAxisId="right" type="monotone" dataKey="short_bal" name="融券餘額" stroke="#60A5FA" strokeWidth={2.5} fillOpacity={1} fill="url(#colorShort)" activeDot={{ r: 5, strokeWidth: 0, fill: "#93C5FD", filter: "url(#glow)" }} />'
)
# 外資持股比例
content = content.replace(
    '<Line type="monotone" dataKey="ratio" name="持股比例" stroke="#A78BFA" dot={false} strokeWidth={2} />',
    '<Area type="monotone" dataKey="ratio" name="持股比例" stroke="#A78BFA" strokeWidth={3} fillOpacity={1} fill="url(#colorRatio)" activeDot={{ r: 6, strokeWidth: 0, fill: "#C4B5FD", filter: "url(#glow)" }} />'
)

# 8. Fundamentals Tab Updates
# 月營收
content = content.replace(
    '<Bar yAxisId="left" dataKey="rev" name="月營收(億)" fill="#3B82F6" opacity={0.8} />',
    '<Bar yAxisId="left" dataKey="rev" name="月營收(億)" fill="#3B82F6" opacity={0.85} radius={[4, 4, 0, 0]} />'
)
content = content.replace(
    '<Line yAxisId="right" type="monotone" dataKey="yoy" name="年增率(%)" stroke="#F59E0B" strokeWidth={2} dot={true} />',
    '<Line yAxisId="right" type="monotone" dataKey="yoy" name="年增率(%)" stroke="#FBBF24" strokeWidth={3} dot={{ r: 4, fill: "#FBBF24", strokeWidth: 0 }} activeDot={{ r: 6, filter: "url(#glow)" }} filter="url(#glow)" />'
)
# EPS
content = content.replace(
    '<Bar dataKey="value" name="EPS(元)" fill="#10B981" opacity={0.8} />',
    '<Bar dataKey="value" name="EPS(元)" fill="#34D399" opacity={0.85} radius={[4, 4, 0, 0]} />'
)

# Replace Grid Opacity
content = content.replace('stroke="#374151" vertical={false}', 'stroke="#374151" vertical={false} opacity={0.4}')

with open('src/frontend/pages/StockAnalysis.jsx', 'w', encoding='utf-8') as f:
    f.write(content)

print("Modification complete.")
