import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { analyzeStock } from '../services/api';
import { 
  TrendingUp, TrendingDown, AlertCircle, CheckCircle, 
  Target, ShieldAlert, BarChart, PieChart, Info, Search
} from 'lucide-react';
import { 
  ResponsiveContainer, ComposedChart, Line, Bar, XAxis, YAxis, Tooltip, Legend, CartesianGrid, Cell
} from 'recharts';

const StockAnalysis = () => {
  const { query: urlQuery } = useParams();
  const navigate = useNavigate();
  const [query, setQuery] = useState(urlQuery || '');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const fetchAnalysis = async (searchQuery) => {
    if (!searchQuery) return;
    setLoading(true);
    setError(null);
    try {
      const res = await analyzeStock(searchQuery);
      setData(res.data);
    } catch (err) {
      setError(err.response?.data?.detail || '分析失敗，請檢查代號是否正確。');
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

  return (
    <div className="max-w-6xl mx-auto space-y-4 sm:space-y-6">
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
        <div className="space-y-4 sm:space-y-6">
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

            <div className="flex flex-row sm:flex-col items-center justify-between sm:justify-center bg-gray-900/50 p-3 sm:p-6 rounded-2xl border border-gray-700 w-full sm:w-auto sm:min-w-[160px]">
              <div className="flex sm:block flex-col sm:text-center">
                <div className="text-gray-400 text-xs sm:text-sm mb-0 sm:mb-1">系統綜合評分</div>
                <div className={`text-3xl sm:text-5xl font-black ${
                  data.total_score >= 70 ? 'text-red-500' : 
                  data.total_score >= 50 ? 'text-orange-500' : 'text-gray-400'
                }`}>
                  {data.total_score}
                </div>
              </div>
              <div className="text-sm font-bold text-blue-400 sm:mt-2 text-right sm:text-center">{data.recommend_status}</div>
            </div>
          </div>

          {/* Charts Section */}
          {data.chart_data && data.chart_data.length > 0 && (
            <div className="grid lg:grid-cols-2 gap-4 sm:gap-6">
              {/* Price & Volume Chart */}
              <div className="bg-gray-800 rounded-2xl border border-gray-700 p-4 sm:p-6 shadow-xl h-[350px]">
                <h2 className="text-lg font-bold text-gray-300 mb-4">價格與成交量</h2>
                <div className="h-[250px] sm:h-[260px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={data.chart_data} margin={{ top: 5, right: 0, left: -20, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#374151" vertical={false} />
                      <XAxis dataKey="date" stroke="#9CA3AF" fontSize={10} tickMargin={5} />
                      <YAxis yAxisId="left" stroke="#9CA3AF" fontSize={10} domain={['auto', 'auto']} />
                      <YAxis yAxisId="right" orientation="right" stroke="#9CA3AF" fontSize={10} />
                      <Tooltip contentStyle={{ backgroundColor: '#1F2937', borderColor: '#374151', color: '#fff' }} itemStyle={{ color: '#E5E7EB' }} />
                      <Legend wrapperStyle={{ fontSize: '12px' }} />
                      <Bar yAxisId="right" dataKey="volume" name="成交量(張)" fill="#4B5563" opacity={0.6} />
                      <Line yAxisId="left" type="monotone" dataKey="close" name="收盤價" stroke="#3B82F6" strokeWidth={2} dot={false} />
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* MACD Chart */}
              <div className="bg-gray-800 rounded-2xl border border-gray-700 p-4 sm:p-6 shadow-xl h-[350px]">
                <h2 className="text-lg font-bold text-gray-300 mb-4">MACD 技術指標</h2>
                <div className="h-[250px] sm:h-[260px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={data.chart_data} margin={{ top: 5, right: 0, left: -20, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#374151" vertical={false} />
                      <XAxis dataKey="date" stroke="#9CA3AF" fontSize={10} tickMargin={5} />
                      <YAxis stroke="#9CA3AF" fontSize={10} />
                      <Tooltip contentStyle={{ backgroundColor: '#1F2937', borderColor: '#374151', color: '#fff' }} itemStyle={{ color: '#E5E7EB' }} />
                      <Legend wrapperStyle={{ fontSize: '12px' }} />
                      <Bar dataKey="macd_hist" name="MACD柱狀">
                        {data.chart_data.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.macd_hist > 0 ? '#EF4444' : '#10B981'} />
                        ))}
                      </Bar>
                      <Line type="monotone" dataKey="macd_line" name="DIF(快線)" stroke="#F59E0B" strokeWidth={1.5} dot={false} />
                      <Line type="monotone" dataKey="macd_signal" name="DEA(慢線)" stroke="#8B5CF6" strokeWidth={1.5} dot={false} />
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>
          )}

          <div className="grid lg:grid-cols-3 gap-4 sm:gap-6">
            {/* Strategy & Target Section */}
            <div className="lg:col-span-2 space-y-4 sm:space-y-6">
              {/* Strategy Card */}
              <div className="bg-gradient-to-br from-blue-900/30 to-purple-900/30 rounded-2xl border border-blue-800/50 p-4 sm:p-6 shadow-xl">
                <div className="flex items-center space-x-2 mb-3 sm:mb-4 text-blue-300">
                  <Target size={20} className="sm:w-6 sm:h-6" />
                  <h2 className="text-lg sm:text-xl font-bold">進場策略建議</h2>
                </div>
                <div className="grid sm:grid-cols-3 gap-3 sm:gap-4">
                  <div className="bg-gray-900/60 p-3 sm:p-4 rounded-xl">
                    <div className="text-gray-400 text-[11px] sm:text-xs mb-1">建議策略</div>
                    <div className="text-base sm:text-lg font-bold text-white">{data.strategy_name}</div>
                  </div>
                  <div className="bg-gray-900/60 p-3 sm:p-4 rounded-xl">
                    <div className="text-gray-400 text-[11px] sm:text-xs mb-1">理想區間</div>
                    <div className="text-base sm:text-lg font-bold text-green-400">{data.entry_range}</div>
                  </div>
                  <div className="bg-gray-900/60 p-3 sm:p-4 rounded-xl">
                    <div className="text-gray-400 text-[11px] sm:text-xs mb-1">停損點位</div>
                    <div className="text-base sm:text-lg font-bold text-red-400">{data.stop_loss}</div>
                  </div>
                </div>
                {data.exit_rule && (
                  <div className="mt-4 p-3 bg-red-900/20 border border-red-900/50 rounded-lg flex items-center space-x-2 text-red-300">
                    <ShieldAlert size={18} />
                    <span className="font-bold">出場鐵律：{data.exit_rule}</span>
                  </div>
                )}
              </div>

              {/* Volume Patterns Section */}
              {data.volume_patterns && data.volume_patterns.length > 0 && (
                <div className="bg-gray-800 rounded-2xl border border-gray-700 p-4 sm:p-6 shadow-xl">
                  <div className="flex items-center space-x-2 mb-3 sm:mb-4 text-gray-300">
                    <BarChart size={20} className="sm:w-6 sm:h-6" />
                    <h2 className="text-lg sm:text-xl font-bold">成交量形態診斷</h2>
                  </div>
                  <div className="grid sm:grid-cols-2 gap-3 sm:gap-4">
                    {data.volume_patterns.map((vp, idx) => {
                      const bg = vp.status === 'positive' ? 'bg-red-900/20 border-red-800/50 text-red-300' 
                               : vp.status === 'negative' ? 'bg-green-900/20 border-green-800/50 text-green-300' 
                               : 'bg-gray-900/60 border-gray-700 text-gray-300';
                      return (
                        <div key={idx} className={`p-3 sm:p-4 rounded-xl border ${bg}`}>
                          <div className="font-bold text-base sm:text-lg mb-1">{vp.pattern}</div>
                          <div className="text-[11px] sm:text-xs opacity-80">{vp.desc}</div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Diagnosis Details */}
              <div className="bg-gray-800 rounded-2xl border border-gray-700 p-4 sm:p-6 shadow-xl">
                <div className="flex items-center space-x-2 mb-3 sm:mb-4 text-gray-300">
                  <Activity size={20} className="sm:w-6 sm:h-6" />
                  <h2 className="text-lg sm:text-xl font-bold">專業診斷報告</h2>
                </div>
                <div className="space-y-2 sm:space-y-3">
                  {data.diagnosis.map((line, idx) => (
                    <div key={idx} className="flex items-start space-x-2 sm:space-x-3 p-2.5 sm:p-3 bg-gray-900/40 rounded-xl hover:bg-gray-900/60 transition">
                      <div className="mt-0.5 sm:mt-1">
                        {line.includes('!!!') || line.includes('警告') ? <ShieldAlert className="text-red-500 w-4 h-4 sm:w-5 sm:h-5" /> : 
                         line.includes('看多') || line.includes('強勢') ? <TrendingUp className="text-red-400 w-4 h-4 sm:w-5 sm:h-5" /> :
                         <CheckCircle className="text-blue-400 w-4 h-4 sm:w-5 sm:h-5" />}
                      </div>
                      <p className="text-gray-200 text-sm sm:text-base leading-relaxed">{line}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Technical Indicators Sidebar */}
            <div className="space-y-4 sm:space-y-6">
              <div className="bg-gray-800 rounded-2xl border border-gray-700 p-4 sm:p-6 shadow-xl">
                <div className="flex items-center space-x-2 mb-3 sm:mb-4 text-gray-300">
                  <BarChart size={20} className="sm:w-6 sm:h-6" />
                  <h2 className="text-lg sm:text-xl font-bold">關鍵技術指標</h2>
                </div>
                <div className="space-y-4">
                  {[
                    { label: 'KD 指標', value: data.kd, color: 'text-orange-400' },
                    { label: 'RSI 強度', value: data.rsi, color: data.rsi > 70 ? 'text-red-400' : 'text-blue-400' },
                    { label: 'MACD 趨勢', value: data.macd, color: data.macd.includes('多') ? 'text-red-400' : 'text-green-400' },
                    { label: '5日均線', value: data.ma5, color: 'text-gray-200' },
                    { label: '20日月線', value: data.ma20, color: 'text-gray-200' },
                    { label: '60日季線', value: data.ma60, color: 'text-gray-200' },
                    { label: '量能比例', value: data.vol_ratio, color: data.vol_ratio > 1.5 ? 'text-orange-400' : 'text-gray-400' },
                    { label: '年化波動率', value: `${data.volatility}%`, color: 'text-purple-400' }
                  ].map(item => (
                    <div key={item.label} className="flex justify-between items-center border-b border-gray-700 pb-2">
                      <span className="text-gray-400 text-sm">{item.label}</span>
                      <span className={`font-bold ${item.color}`}>{item.value}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Fundamentals Card */}
              <div className="bg-gray-800 rounded-2xl border border-gray-700 p-4 sm:p-6 shadow-xl">
                <div className="flex items-center space-x-2 mb-3 sm:mb-4 text-gray-300">
                  <PieChart size={20} className="sm:w-6 sm:h-6" />
                  <h2 className="text-lg sm:text-xl font-bold">基本面評估</h2>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-gray-900/60 p-3 rounded-xl text-center">
                    <div className="text-gray-500 text-[10px] uppercase">本益比 PE</div>
                    <div className="text-lg font-bold">{data.pe}</div>
                  </div>
                  <div className="bg-gray-900/60 p-3 rounded-xl text-center">
                    <div className="text-gray-500 text-[10px] uppercase">殖利率 %</div>
                    <div className="text-lg font-bold">{data.yield}%</div>
                  </div>
                  <div className="bg-gray-900/60 p-3 rounded-xl text-center">
                    <div className="text-gray-500 text-[10px] uppercase">ROE %</div>
                    <div className="text-lg font-bold">{data.roe}%</div>
                  </div>
                  <div className="bg-gray-900/60 p-3 rounded-xl text-center">
                    <div className="text-gray-500 text-[10px] uppercase">負債比 %</div>
                    <div className="text-lg font-bold">{data.debt_ratio}%</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// Activity icon for the diagnosis section
const Activity = ({ size, className }) => (
  <svg 
    xmlns="http://www.w3.org/2000/svg" 
    width={size} 
    height={size} 
    viewBox="0 0 24 24" 
    fill="none" 
    stroke="currentColor" 
    strokeWidth="2" 
    strokeLinecap="round" 
    strokeLinejoin="round" 
    className={className}
  >
    <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"></polyline>
  </svg>
);

export default StockAnalysis;
