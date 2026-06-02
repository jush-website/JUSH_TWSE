import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { analyzeStockRaw } from '../services/api';
import { 
  TrendingUp, TrendingDown, AlertCircle, Search, 
  Newspaper, FileText, PieChart, BarChart2
} from 'lucide-react';
import { 
  ResponsiveContainer, ComposedChart, Line, Bar, XAxis, YAxis, Tooltip, Legend, CartesianGrid
} from 'recharts';

const StockAnalysis = () => {
  const { query: urlQuery } = useParams();
  const navigate = useNavigate();
  const [query, setQuery] = useState(urlQuery || '');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState('dashboard');

  const fetchAnalysis = async (searchQuery) => {
    if (!searchQuery) return;
    setLoading(true);
    setError(null);
    try {
      const response = await analyzeStockRaw(searchQuery);
      setData(response.data);
    } catch (err) {
      const msg = err.response?.data?.detail || err.message || '分析失敗，請檢查代號是否正確。';
      setError(msg === "超過使用次數" ? "FinMind 免費版限制：超過單小時 300 次請求，請稍後再試！" : msg);
      setData(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (urlQuery) {
      fetchAnalysis(urlQuery);
    }
  }, [urlQuery]);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (query.trim()) {
      navigate(`/analyze/${query}`);
    }
  };

  const isPositive = data?.change_percent >= 0;

  // Process data for charts
  const epsData = data?.financial_data?.filter(d => d.type === 'EPS') || [];
  const revData = data?.revenue_data || [];
  
  // Format revenue for chart (group by month/year)
  const chartRevData = revData.slice(-36).map(d => ({
    date: d.date,
    revenue: d.revenue / 100000000, // 億
    yoy: d.revenue_year_on_year
  }));

  const chartEpsData = epsData.slice(-12).map(d => ({
    date: d.date,
    value: d.value
  }));

  return (
    <div className="max-w-7xl mx-auto space-y-4 sm:space-y-6 pb-20">
      {/* Search Section */}
      <div className="bg-gray-800 p-4 sm:p-6 rounded-2xl border border-gray-700 shadow-xl">
        <form onSubmit={handleSubmit} className="flex gap-2 sm:gap-4">
          <div className="relative flex-1">
            <input
              type="text"
              placeholder="輸入股票代號或名稱 (例如: 2330 或 台積電)"
              className="w-full bg-gray-900 border-gray-600 rounded-xl py-2.5 sm:py-3 pl-10 sm:pl-12 pr-4 focus:ring-2 focus:ring-blue-500 text-sm sm:text-lg"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <Search className="absolute left-3 sm:left-4 top-3 sm:top-3.5 text-gray-400 w-5 h-5 sm:w-6 sm:h-6" />
          </div>
          <button 
            type="submit"
            disabled={loading}
            className="bg-blue-600 hover:bg-blue-700 px-4 sm:px-8 py-2.5 sm:py-3 rounded-xl font-bold transition disabled:bg-gray-700 text-sm sm:text-base whitespace-nowrap"
          >
            {loading ? '分析中...' : '開始診斷'}
          </button>
        </form>
      </div>

      {error && (
        <div className="bg-red-900/30 border border-red-800 text-red-200 p-4 rounded-xl flex items-center space-x-3">
          <AlertCircle size={20} />
          <span>{error}</span>
        </div>
      )}

      {loading && (
        <div className="text-center py-20">
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-4 border-blue-500 border-t-transparent mb-4"></div>
          <p className="text-gray-400 text-lg">正在讀取雲端數據並計算技術指標...</p>
        </div>
      )}

      {data && !loading && (
        <>
          {/* Header Summary */}
          <div className="bg-gray-800 rounded-2xl border border-gray-700 p-4 sm:p-6 shadow-xl flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 sm:gap-6">
            <div className="flex items-center space-x-3 sm:space-x-4">
              <div className={`p-3 sm:p-4 rounded-2xl ${isPositive ? 'bg-red-900/40 text-red-400' : 'bg-green-900/40 text-green-400'}`}>
                {isPositive ? <TrendingUp size={36} className="sm:w-12 sm:h-12" /> : <TrendingDown size={36} className="sm:w-12 sm:h-12" />}
              </div>
              <div>
                <div className="flex items-center space-x-2 sm:space-x-3">
                  <h1 className="text-xl sm:text-3xl font-bold">{data.stock_name}</h1>
                  <span className="text-base sm:text-xl text-gray-400">{data.stock_id}</span>
                  <span className="bg-gray-700 text-gray-300 text-[10px] sm:text-xs px-2 py-1 rounded">{data.category}</span>
                </div>
                <div className="flex items-center space-x-2 sm:space-x-4 mt-1">
                  <span className="text-2xl sm:text-4xl font-black">{data.price}</span>
                  <span className={`text-base sm:text-xl font-bold ${isPositive ? 'text-red-400' : 'text-green-400'}`}>
                    {isPositive ? '+' : ''}{data.change_percent}%
                  </span>
                  <span className="text-xs sm:text-sm text-gray-500 hidden sm:inline">昨收: {data.yesterday_close}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Tab Navigation */}
          <div className="flex space-x-2 overflow-x-auto pb-2 scrollbar-hide">
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
              <div className="space-y-6">
                
                {/* Top Cards (Price, Foreign, Trust) */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="bg-gray-800 p-5 rounded-2xl border border-gray-700 shadow-xl">
                    <div className="text-sm text-gray-400 mb-2">股價資訊</div>
                    <div className="text-2xl font-bold">{data.price}</div>
                    <div className="text-sm text-gray-400 mt-2">昨收 {data.yesterday_close}</div>
                  </div>
                  <div className="bg-gray-800 p-5 rounded-2xl border border-gray-700 shadow-xl">
                    <div className="text-sm text-gray-400 mb-2">外資買賣超(3日)</div>
                    <div className={`text-2xl font-bold ${data.net_buy_3d > 0 ? 'text-red-400' : 'text-green-400'}`}>
                      {data.net_buy_3d > 0 ? '+' : ''}{data.net_buy_3d} 張
                    </div>
                  </div>
                  <div className="bg-gray-800 p-5 rounded-2xl border border-gray-700 shadow-xl">
                    <div className="text-sm text-gray-400 mb-2">本益比 / 殖利率</div>
                    <div className="text-2xl font-bold text-blue-400">{data.pe} / {data.yield}%</div>
                  </div>
                </div>

                {/* Charts */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
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

                {/* Indicator Cards */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="bg-gray-800 p-4 rounded-xl border border-gray-700 text-center">
                    <div className="text-xs text-gray-400">系統評分</div>
                    <div className="text-xl font-bold mt-1 text-orange-400">{data.total_score}</div>
                  </div>
                  <div className="bg-gray-800 p-4 rounded-xl border border-gray-700 text-center">
                    <div className="text-xs text-gray-400">BIAS 乖離率</div>
                    <div className="text-xl font-bold mt-1 text-blue-400">{data.bias_20}%</div>
                  </div>
                  <div className="bg-gray-800 p-4 rounded-xl border border-gray-700 text-center">
                    <div className="text-xs text-gray-400">RSI 指標</div>
                    <div className="text-xl font-bold mt-1 text-purple-400">{data.rsi}</div>
                  </div>
                  <div className="bg-gray-800 p-4 rounded-xl border border-gray-700 text-center">
                    <div className="text-xs text-gray-400">MACD</div>
                    <div className="text-xl font-bold mt-1 text-pink-400">{data.macd}</div>
                  </div>
                </div>

                {/* Dividend Tables */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="bg-gray-800 rounded-2xl border border-gray-700 shadow-xl overflow-hidden">
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
                  
                  <div className="bg-gray-800 rounded-2xl border border-gray-700 shadow-xl overflow-hidden flex items-center justify-center min-h-[200px]">
                     <div className="text-center p-6">
                        <div className="text-2xl font-bold text-gray-300 mb-2">技術分析摘要</div>
                        <div className="text-blue-400">{data.diagnosis}</div>
                     </div>
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

          </div>
        </>
      )}
    </div>
  );
};

export default StockAnalysis;
