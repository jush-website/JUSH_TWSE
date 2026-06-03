import re

path = r"c:\Users\minar\OneDrive - 國立屏東科技大學\文件\GitHub\JUSH_TWSE\src\frontend\pages\StockAnalysis.jsx"
with open(path, "r", encoding="utf-8") as f:
    content = f.read()

# Add Tabs Menu
tabs_menu = """
          </div>

          {/* Tabs Menu */}
          <div className="flex space-x-2 overflow-x-auto bg-gray-800 p-2 rounded-2xl border border-gray-700 shadow-xl scrollbar-hide">
            {[
              { id: 'dashboard', label: '綜合分析' },
              { id: 'chips', label: '籌碼分析' },
              { id: 'fundamentals', label: '基本面' },
              { id: 'news', label: '個股新聞' }
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`px-4 sm:px-6 py-2 sm:py-3 rounded-xl font-bold text-sm sm:text-base whitespace-nowrap transition-all ${
                  activeTab === tab.id 
                  ? 'bg-blue-600 text-white shadow-lg' 
                  : 'text-gray-400 hover:bg-gray-700 hover:text-gray-200'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
"""

# Insert the tabs menu right after the Header Summary
content = content.replace("          </div>\n\n          {/* Charts Section */}", tabs_menu + "\n          {activeTab === 'dashboard' && (\n            <div className=\"space-y-4 sm:space-y-6\">\n              {/* Charts Section */}")

# Now we need to close the 'dashboard' div and add the other tabs.
# The dashboard div closes before the final `</div>` of `data && !loading`.
content = content.replace("          </div>\n        </div>\n      )}\n    </div>\n  );\n};", """          </div>
            </div>
          )}

          {activeTab === 'chips' && (
            <div className="space-y-4 sm:space-y-6">
              {/* 法人買賣超 */}
              {data.chip_processed && data.chip_processed.length > 0 && (
                <div className="bg-gray-800 rounded-2xl border border-gray-700 p-4 sm:p-6 shadow-xl h-[400px]">
                  <h2 className="text-lg font-bold text-gray-300 mb-4">三大法人買賣超 (張)</h2>
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={data.chip_processed.slice(-60)} margin={{ top: 5, right: 0, left: -20, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#374151" vertical={false} />
                      <XAxis dataKey="date" stroke="#9CA3AF" fontSize={10} tickMargin={5} />
                      <YAxis stroke="#9CA3AF" fontSize={10} />
                      <Tooltip contentStyle={{ backgroundColor: '#1F2937', borderColor: '#374151', color: '#fff' }} />
                      <Legend />
                      <Bar dataKey="foreign_net" name="外資淨買賣" fill="#3B82F6" />
                      <Bar dataKey="trust_net" name="投信淨買賣" fill="#10B981" />
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
              )}
              {/* 資券變化 */}
              {data.margin_processed && data.margin_processed.length > 0 && (
                <div className="bg-gray-800 rounded-2xl border border-gray-700 p-4 sm:p-6 shadow-xl h-[400px]">
                  <h2 className="text-lg font-bold text-gray-300 mb-4">融資融券餘額 (張)</h2>
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={data.margin_processed.slice(-60)} margin={{ top: 5, right: 0, left: -20, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#374151" vertical={false} />
                      <XAxis dataKey="date" stroke="#9CA3AF" fontSize={10} tickMargin={5} />
                      <YAxis yAxisId="left" stroke="#F87171" fontSize={10} />
                      <YAxis yAxisId="right" orientation="right" stroke="#60A5FA" fontSize={10} />
                      <Tooltip contentStyle={{ backgroundColor: '#1F2937', borderColor: '#374151', color: '#fff' }} />
                      <Legend />
                      <Line yAxisId="left" type="monotone" dataKey="margin_bal" name="融資餘額" stroke="#F87171" dot={false} strokeWidth={2} />
                      <Line yAxisId="right" type="monotone" dataKey="short_bal" name="融券餘額" stroke="#60A5FA" dot={false} strokeWidth={2} />
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
              )}
              {/* 外資持股比例 */}
              {data.shareholding_processed && data.shareholding_processed.length > 0 && (
                <div className="bg-gray-800 rounded-2xl border border-gray-700 p-4 sm:p-6 shadow-xl h-[400px]">
                  <h2 className="text-lg font-bold text-gray-300 mb-4">外資持股比例 (%)</h2>
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={data.shareholding_processed.slice(-60)} margin={{ top: 5, right: 0, left: -20, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#374151" vertical={false} />
                      <XAxis dataKey="date" stroke="#9CA3AF" fontSize={10} tickMargin={5} />
                      <YAxis domain={['auto', 'auto']} stroke="#9CA3AF" fontSize={10} />
                      <Tooltip contentStyle={{ backgroundColor: '#1F2937', borderColor: '#374151', color: '#fff' }} />
                      <Legend />
                      <Line type="monotone" dataKey="ratio" name="持股比例" stroke="#A78BFA" dot={false} strokeWidth={2} />
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>
          )}

          {activeTab === 'fundamentals' && (
            <div className="space-y-4 sm:space-y-6">
              {/* 月營收 */}
              {data.revenue_data && data.revenue_data.length > 0 && (
                <div className="bg-gray-800 rounded-2xl border border-gray-700 p-4 sm:p-6 shadow-xl h-[400px]">
                  <h2 className="text-lg font-bold text-gray-300 mb-4">月營收與年增率</h2>
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={data.revenue_data.slice(-36).map(d => ({ date: d.date, rev: d.revenue/100000000, yoy: d.revenue_year_on_year }))} margin={{ top: 5, right: 0, left: -20, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#374151" vertical={false} />
                      <XAxis dataKey="date" stroke="#9CA3AF" fontSize={10} tickMargin={5} />
                      <YAxis yAxisId="left" stroke="#9CA3AF" fontSize={10} />
                      <YAxis yAxisId="right" orientation="right" stroke="#F59E0B" fontSize={10} />
                      <Tooltip contentStyle={{ backgroundColor: '#1F2937', borderColor: '#374151', color: '#fff' }} />
                      <Legend />
                      <Bar yAxisId="left" dataKey="rev" name="月營收(億)" fill="#3B82F6" opacity={0.8} />
                      <Line yAxisId="right" type="monotone" dataKey="yoy" name="年增率(%)" stroke="#F59E0B" strokeWidth={2} dot={true} />
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
              )}
              {/* EPS */}
              {data.financial_data && data.financial_data.filter(d => d.type === 'EPS').length > 0 && (
                <div className="bg-gray-800 rounded-2xl border border-gray-700 p-4 sm:p-6 shadow-xl h-[400px]">
                  <h2 className="text-lg font-bold text-gray-300 mb-4">每股盈餘 (EPS)</h2>
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={data.financial_data.filter(d => d.type === 'EPS').slice(-12)} margin={{ top: 5, right: 0, left: -20, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#374151" vertical={false} />
                      <XAxis dataKey="date" stroke="#9CA3AF" fontSize={10} tickMargin={5} />
                      <YAxis stroke="#9CA3AF" fontSize={10} />
                      <Tooltip contentStyle={{ backgroundColor: '#1F2937', borderColor: '#374151', color: '#fff' }} />
                      <Legend />
                      <Bar dataKey="value" name="EPS(元)" fill="#10B981" opacity={0.8} />
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
              )}
              {/* 財報 Table */}
              {data.financial_data && data.financial_data.length > 0 && (
                <div className="bg-gray-800 rounded-2xl border border-gray-700 p-4 sm:p-6 shadow-xl overflow-x-auto">
                  <h2 className="text-lg font-bold text-gray-300 mb-4">綜合損益表 (部分)</h2>
                  <table className="w-full text-left text-sm text-gray-300 whitespace-nowrap">
                    <thead className="bg-gray-900 text-gray-400">
                      <tr>
                        <th className="p-3 rounded-tl-xl">日期</th>
                        <th className="p-3">項目</th>
                        <th className="p-3 rounded-tr-xl">數值</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.financial_data.slice(-50).map((item, idx) => (
                        <tr key={idx} className="border-b border-gray-700/50 hover:bg-gray-750">
                          <td className="p-3">{item.date}</td>
                          <td className="p-3">{item.type}</td>
                          <td className="p-3">{item.value?.toLocaleString()}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {activeTab === 'news' && (
            <div className="space-y-4 sm:space-y-6">
              <div className="bg-gray-800 rounded-2xl border border-gray-700 p-4 sm:p-6 shadow-xl">
                <h2 className="text-lg font-bold text-gray-300 mb-4">個股相關新聞</h2>
                {data.news_data && data.news_data.length > 0 ? (
                  <div className="space-y-4">
                    {data.news_data.slice().reverse().slice(0, 30).map((news, idx) => (
                      <a key={idx} href={news.link} target="_blank" rel="noreferrer" className="block p-4 bg-gray-900/50 rounded-xl hover:bg-gray-900 transition border border-transparent hover:border-gray-600">
                        <div className="text-xs text-gray-400 mb-1">{news.date}</div>
                        <h3 className="text-base font-bold text-blue-400 mb-2">{news.title}</h3>
                      </a>
                    ))}
                  </div>
                ) : (
                  <div className="text-gray-500 text-center py-10">暫無近期新聞</div>
                )}
              </div>
            </div>
          )}

        </div>
      )}
    </div>
  );
};""")

with open(path, "w", encoding="utf-8") as f:
    f.write(content)

print("Modified StockAnalysis.jsx successfully.")
