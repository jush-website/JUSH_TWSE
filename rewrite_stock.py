import codecs

with codecs.open('src/frontend/pages/StockAnalysis.jsx', 'r', 'utf-8') as f:
    content = f.read()

# 1. Imports
content = content.replace("} from 'lucide-react';", ", Newspaper, FileText, BarChart2 } from 'lucide-react';")

# 2. State
content = content.replace("  const [error, setError] = useState(null);", "  const [error, setError] = useState(null);\n  const [activeTab, setActiveTab] = useState('dashboard');")

# 3. Chart data processing
chart_process = """  const isPositive = data?.change_percent >= 0;

  // Process data for charts
  const epsData = data?.financial_data?.filter(d => d.type === 'EPS') || [];
  const revData = data?.revenue_data || [];
  
  const chartRevData = revData.slice(-36).map(d => ({
    date: d.date,
    revenue: d.revenue / 100000000,
    yoy: d.revenue_year_on_year
  }));

  const chartEpsData = epsData.slice(-12).map(d => ({
    date: d.date,
    value: d.value
  }));"""
content = content.replace("  const isPositive = data?.change_percent >= 0;", chart_process)

# 4. Tab Navigation
tabs_html = """          </div>

          {/* Tab Navigation */}
          <div className="flex space-x-2 overflow-x-auto pb-2 scrollbar-hide mt-6">
            <button onClick={() => setActiveTab('dashboard')} className={`px-6 py-3 rounded-xl font-bold transition flex items-center space-x-2 ${activeTab === 'dashboard' ? 'bg-blue-600 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'}`}>
              <BarChart2 size={18} /><span>綜合分析</span>
            </button>
            <button onClick={() => setActiveTab('news')} className={`px-6 py-3 rounded-xl font-bold transition flex items-center space-x-2 ${activeTab === 'news' ? 'bg-blue-600 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'}`}>
              <Newspaper size={18} /><span>新聞</span>
            </button>
            <button onClick={() => setActiveTab('income')} className={`px-6 py-3 rounded-xl font-bold transition flex items-center space-x-2 ${activeTab === 'income' ? 'bg-blue-600 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'}`}>
              <FileText size={18} /><span>綜合損益表</span>
            </button>
            <button onClick={() => setActiveTab('balance')} className={`px-6 py-3 rounded-xl font-bold transition flex items-center space-x-2 ${activeTab === 'balance' ? 'bg-blue-600 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'}`}>
              <PieChart size={18} /><span>資產負債表</span>
            </button>
          </div>

          {/* Tab Content */}
          <div className="mt-4">
            {activeTab === 'dashboard' && (
              <div className="space-y-4 sm:space-y-6">"""
content = content.replace("          </div>\n\n          {/* Charts Section */}", tabs_html + "\n          {/* Charts Section */}")

# 5. New FinMind Charts & Dividends and other tabs
new_tabs_content = """            </div>
            
            {/* New FinMind Charts & Dividends for Dashboard */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-6">
              <div className="bg-gray-800 p-5 rounded-2xl border border-gray-700 shadow-xl h-[350px]">
                <h3 className="text-lg font-bold mb-4">EPS 歷年走勢</h3>
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={chartEpsData} margin={{ top: 5, right: 0, left: -20, bottom: 20 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#374151" vertical={false} />
                    <XAxis dataKey="date" stroke="#9CA3AF" fontSize={10} tickMargin={5} />
                    <YAxis stroke="#9CA3AF" fontSize={10} />
                    <Tooltip contentStyle={{ backgroundColor: '#1F2937', borderColor: '#374151' }} />
                    <Line type="monotone" dataKey="value" name="EPS" stroke="#EF4444" strokeWidth={2} />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
              
              <div className="bg-gray-800 p-5 rounded-2xl border border-gray-700 shadow-xl h-[350px]">
                <h3 className="text-lg font-bold mb-4">月營收 (億)</h3>
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={chartRevData} margin={{ top: 5, right: 0, left: -20, bottom: 20 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#374151" vertical={false} />
                    <XAxis dataKey="date" stroke="#9CA3AF" fontSize={10} tickMargin={5} />
                    <YAxis stroke="#9CA3AF" fontSize={10} />
                    <Tooltip contentStyle={{ backgroundColor: '#1F2937', borderColor: '#374151' }} />
                    <Bar dataKey="revenue" name="營收(億)" fill="#3B82F6" opacity={0.8} />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="bg-gray-800 rounded-2xl border border-gray-700 shadow-xl overflow-hidden mt-6">
              <h3 className="p-4 font-bold bg-gray-900 border-b border-gray-700 text-green-400">除息/配息紀錄</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-sm text-left">
                  <thead className="bg-gray-800 text-gray-400">
                    <tr>
                      <th className="px-4 py-3">日期</th>
                      <th className="px-4 py-3">現金股利</th>
                      <th className="px-4 py-3">股票股利</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.dividend_data && data.dividend_data.slice(0, 10).map((d, i) => (
                      <tr key={i} className="border-t border-gray-700 hover:bg-gray-700/50">
                        <td className="px-4 py-3">{d.date}</td>
                        <td className="px-4 py-3 text-red-400">{d.cash_dividend || '-'}</td>
                        <td className="px-4 py-3 text-blue-400">{d.stock_dividend || '-'}</td>
                      </tr>
                    ))}
                    {(!data.dividend_data || data.dividend_data.length === 0) && (
                      <tr><td colSpan="3" className="px-4 py-4 text-center text-gray-500">尚無股利資料</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
            
            </div>
            )}

            {activeTab === 'news' && (
              <div className="bg-gray-800 rounded-2xl border border-gray-700 shadow-xl p-6">
                <h3 className="text-xl font-bold mb-6 text-blue-400 flex items-center gap-2"><Newspaper /> 個股相關新聞</h3>
                <div className="space-y-4">
                  {data.news_data && data.news_data.length > 0 ? (
                    data.news_data.map((item, idx) => (
                      <a key={idx} href={item.link} target="_blank" rel="noopener noreferrer" className="block bg-gray-900/50 p-4 rounded-xl border border-gray-700 hover:border-blue-500 hover:bg-gray-800 transition">
                        <div className="text-xs text-gray-400 mb-1">{item.date} | {item.source}</div>
                        <div className="text-lg font-bold text-gray-200">{item.title}</div>
                      </a>
                    ))
                  ) : (
                    <div className="text-center py-10 text-gray-500">暫無新聞資料 (可能受到 FinMind 額度限制)</div>
                  )}
                </div>
              </div>
            )}

            {activeTab === 'income' && (
              <div className="bg-gray-800 rounded-2xl border border-gray-700 shadow-xl overflow-hidden">
                 <h3 className="p-6 font-bold bg-gray-900 border-b border-gray-700 text-blue-400 text-xl flex items-center gap-2"><FileText/> 綜合損益表</h3>
                 <div className="overflow-x-auto p-4">
                    <table className="w-full text-sm text-left">
                      <thead className="bg-gray-800 text-gray-400 border-b border-gray-600">
                        <tr>
                          <th className="px-4 py-3">日期</th>
                          <th className="px-4 py-3">項目</th>
                          <th className="px-4 py-3 text-right">數值</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.financial_data && data.financial_data.filter(d => d.type !== 'BalanceSheet').slice(0, 100).map((d, i) => (
                          <tr key={i} className="border-b border-gray-700 hover:bg-gray-700/50">
                            <td className="px-4 py-2">{d.date}</td>
                            <td className="px-4 py-2 text-gray-300">{d.origin_name}</td>
                            <td className="px-4 py-2 text-right text-blue-300">{Number(d.value).toLocaleString()}</td>
                          </tr>
                        ))}
                        {(!data.financial_data || data.financial_data.length === 0) && (
                          <tr><td colSpan="3" className="px-4 py-8 text-center text-gray-500">暫無財報資料 (可能受到 FinMind 額度限制)</td></tr>
                        )}
                      </tbody>
                    </table>
                 </div>
              </div>
            )}

            {activeTab === 'balance' && (
              <div className="bg-gray-800 rounded-2xl border border-gray-700 shadow-xl overflow-hidden">
                 <h3 className="p-6 font-bold bg-gray-900 border-b border-gray-700 text-purple-400 text-xl flex items-center gap-2"><PieChart/> 資產負債表</h3>
                 <div className="overflow-x-auto p-4">
                    <table className="w-full text-sm text-left">
                      <thead className="bg-gray-800 text-gray-400 border-b border-gray-600">
                        <tr>
                          <th className="px-4 py-3">日期</th>
                          <th className="px-4 py-3">項目</th>
                          <th className="px-4 py-3 text-right">數值</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.financial_data && data.financial_data.filter(d => d.type === 'BalanceSheet').slice(0, 100).map((d, i) => (
                          <tr key={i} className="border-b border-gray-700 hover:bg-gray-700/50">
                            <td className="px-4 py-2">{d.date}</td>
                            <td className="px-4 py-2 text-gray-300">{d.origin_name}</td>
                            <td className="px-4 py-2 text-right text-purple-300">{Number(d.value).toLocaleString()}</td>
                          </tr>
                        ))}
                        {(!data.financial_data || data.financial_data.length === 0) && (
                          <tr><td colSpan="3" className="px-4 py-8 text-center text-gray-500">暫無財報資料 (可能受到 FinMind 額度限制)</td></tr>
                        )}
                      </tbody>
                    </table>
                 </div>
              </div>
            )}

          </div>"""

content = content.replace(
"""            </div>
          </div>
        </div>
      )}
    </div>""", new_tabs_content + "\n        </>\n      )}\n    </div>"
)

content = content.replace(
"""      {data && !loading && (
        <div className="space-y-4 sm:space-y-6">
          {/* Header Summary */}""", 
"""      {data && !loading && (
        <>
          {/* Header Summary */}"""
)

with codecs.open('src/frontend/pages/StockAnalysis.jsx', 'w', 'utf-8') as f:
    f.write(content)
