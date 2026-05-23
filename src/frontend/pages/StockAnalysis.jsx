import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { analyzeStock } from '../services/api';
import { 
  TrendingUp, TrendingDown, AlertCircle, CheckCircle, 
  Target, ShieldAlert, BarChart, PieChart, Info, Search
} from 'lucide-react';
import ProgressLoader from '../components/ProgressLoader';

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
    <div className="max-w-6xl mx-auto space-y-6">
      {/* Search Section */}
      <div className="bg-gray-800 p-6 rounded-2xl border border-gray-700 shadow-xl">
        <form onSubmit={handleSubmit} className="flex gap-4">
          <div className="relative flex-1">
            <input
              type="text"
              placeholder="輸入股票代號或名稱 (例如: 2330 或 台積電)"
              className="w-full bg-gray-900 border-gray-600 rounded-xl py-3 pl-12 pr-4 focus:ring-2 focus:ring-blue-500 text-lg"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <Search className="absolute left-4 top-3.5 text-gray-400" size={24} />
          </div>
          <button 
            type="submit"
            disabled={loading}
            className="bg-blue-600 hover:bg-blue-700 px-8 py-3 rounded-xl font-bold transition disabled:bg-gray-700"
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
        <ProgressLoader text="正在從雲端讀取資料並計算即時技術指標..." />
      )}

      {data && !loading && (
        <div className="space-y-6">
          {/* Header Summary */}
          <div className="bg-gray-800 rounded-2xl border border-gray-700 p-6 shadow-xl flex flex-wrap justify-between items-center gap-6">
            <div className="flex items-center space-x-4">
              <div className={`p-4 rounded-2xl ${isPositive ? 'bg-red-900/40 text-red-400' : 'bg-green-900/40 text-green-400'}`}>
                {isPositive ? <TrendingUp size={48} /> : <TrendingDown size={48} />}
              </div>
              <div>
                <div className="flex items-center space-x-3">
                  <h1 className="text-3xl font-bold">{data.stock_name}</h1>
                  <span className="text-xl text-gray-400">{data.stock_id}</span>
                  <span className="bg-gray-700 text-gray-300 text-xs px-2 py-1 rounded">{data.category}</span>
                </div>
                <div className="flex items-center space-x-4 mt-1">
                  <span className="text-4xl font-black">{data.price}</span>
                  <span className={`text-xl font-bold ${isPositive ? 'text-red-400' : 'text-green-400'}`}>
                    {isPositive ? '+' : ''}{data.change_percent}%
                  </span>
                  <span className="text-gray-500">昨收: {data.yesterday_close}</span>
                </div>
              </div>
            </div>

            <div className="flex flex-col items-center justify-center bg-gray-900/50 p-6 rounded-2xl border border-gray-700 min-w-[160px]">
              <div className="text-gray-400 text-sm mb-1">系統綜合評分</div>
              <div className={`text-5xl font-black ${
                data.total_score >= 70 ? 'text-red-500' : 
                data.total_score >= 50 ? 'text-orange-500' : 'text-gray-400'
              }`}>
                {data.total_score}
              </div>
              <div className="text-sm font-bold text-blue-400 mt-2">{data.recommend_status}</div>
            </div>
          </div>

          <div className="grid lg:grid-cols-3 gap-6">
            {/* Strategy & Target Section */}
            <div className="lg:col-span-2 space-y-6">
              {/* Strategy Card */}
              <div className="bg-gradient-to-br from-blue-900/30 to-purple-900/30 rounded-2xl border border-blue-800/50 p-6 shadow-xl">
                <div className="flex items-center space-x-2 mb-4 text-blue-300">
                  <Target size={24} />
                  <h2 className="text-xl font-bold">進場策略建議</h2>
                </div>
                <div className="grid sm:grid-cols-3 gap-4">
                  <div className="bg-gray-900/60 p-4 rounded-xl">
                    <div className="text-gray-400 text-xs mb-1">建議策略</div>
                    <div className="text-lg font-bold text-white">{data.strategy_name}</div>
                  </div>
                  <div className="bg-gray-900/60 p-4 rounded-xl">
                    <div className="text-gray-400 text-xs mb-1">理想區間</div>
                    <div className="text-lg font-bold text-green-400">{data.entry_range}</div>
                  </div>
                  <div className="bg-gray-900/60 p-4 rounded-xl">
                    <div className="text-gray-400 text-xs mb-1">停損點位</div>
                    <div className="text-lg font-bold text-red-400">{data.stop_loss}</div>
                  </div>
                </div>
                {data.exit_rule && (
                  <div className="mt-4 p-3 bg-red-900/20 border border-red-900/50 rounded-lg flex items-center space-x-2 text-red-300">
                    <ShieldAlert size={18} />
                    <span className="font-bold">出場鐵律：{data.exit_rule}</span>
                  </div>
                )}
              </div>

              {/* CDP Card */}
              {data.cdp && (
                <div className="bg-gray-800 rounded-2xl border border-gray-700 p-6 shadow-xl space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-2 text-purple-400">
                      <Target size={24} />
                      <h2 className="text-xl font-bold">CDP 逆勢操作值</h2>
                    </div>
                    {data.cdp.base_date && (
                      <span className="text-xs bg-purple-900/40 text-purple-300 px-2 py-1 rounded">
                        基準日期: {data.cdp.base_date}
                      </span>
                    )}
                  </div>
                  
                  <div className="grid grid-cols-5 gap-2 sm:gap-4 text-center">
                    <div className="bg-red-950/40 border border-red-900/50 p-3 rounded-xl">
                      <div className="text-red-400 text-[10px] sm:text-xs font-bold mb-1">AH (最高阻力)</div>
                      <div className="text-sm sm:text-lg font-black text-red-300">{data.cdp.AH}</div>
                      <div className="text-[10px] text-gray-500 mt-1 hidden sm:block">突破追買</div>
                    </div>
                    <div className="bg-orange-950/40 border border-orange-900/30 p-3 rounded-xl">
                      <div className="text-orange-400 text-[10px] sm:text-xs font-bold mb-1">NH (近阻力)</div>
                      <div className="text-sm sm:text-lg font-black text-orange-300">{data.cdp.NH}</div>
                      <div className="text-[10px] text-gray-500 mt-1 hidden sm:block">高開賣出</div>
                    </div>
                    <div className="bg-gray-900/80 border border-gray-700 p-3 rounded-xl">
                      <div className="text-gray-300 text-[10px] sm:text-xs font-bold mb-1">CDP (昨均價)</div>
                      <div className="text-sm sm:text-lg font-black text-white">{data.cdp.CDP}</div>
                      <div className="text-[10px] text-gray-500 mt-1 hidden sm:block">多空值</div>
                    </div>
                    <div className="bg-green-950/40 border border-green-900/30 p-3 rounded-xl">
                      <div className="text-green-400 text-[10px] sm:text-xs font-bold mb-1">NL (近支撐)</div>
                      <div className="text-sm sm:text-lg font-black text-green-300">{data.cdp.NL}</div>
                      <div className="text-[10px] text-gray-500 mt-1 hidden sm:block">低開買進</div>
                    </div>
                    <div className="bg-emerald-950/40 border border-emerald-900/50 p-3 rounded-xl">
                      <div className="text-emerald-400 text-[10px] sm:text-xs font-bold mb-1">AL (最低支撐)</div>
                      <div className="text-sm sm:text-lg font-black text-emerald-300">{data.cdp.AL}</div>
                      <div className="text-[10px] text-gray-500 mt-1 hidden sm:block">跌破追賣</div>
                    </div>
                  </div>

                  {data.cdp.signals && data.cdp.signals.length > 0 && (
                    <div className="flex flex-wrap gap-2 pt-2">
                      {data.cdp.signals.map((sig, sIdx) => (
                        <span key={sIdx} className="bg-purple-900/30 text-purple-300 text-xs px-2.5 py-1 rounded-full border border-purple-800/30">
                          {sig}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Diagnosis Details */}
              <div className="bg-gray-800 rounded-2xl border border-gray-700 p-6 shadow-xl">
                <div className="flex items-center space-x-2 mb-4 text-gray-300">
                  <Activity size={24} />
                  <h2 className="text-xl font-bold">專業診斷報告</h2>
                </div>
                <div className="space-y-3">
                  {data.diagnosis.map((line, idx) => (
                    <div key={idx} className="flex items-start space-x-3 p-3 bg-gray-900/40 rounded-xl hover:bg-gray-900/60 transition">
                      <div className="mt-1">
                        {line.includes('!!!') || line.includes('警告') ? <ShieldAlert className="text-red-500" size={18} /> : 
                         line.includes('看多') || line.includes('強勢') ? <TrendingUp className="text-red-400" size={18} /> :
                         <CheckCircle className="text-blue-400" size={18} />}
                      </div>
                      <p className="text-gray-200 leading-relaxed">{line}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Technical Indicators Sidebar */}
            <div className="space-y-6">
              <div className="bg-gray-800 rounded-2xl border border-gray-700 p-6 shadow-xl">
                <div className="flex items-center space-x-2 mb-4 text-gray-300">
                  <BarChart size={24} />
                  <h2 className="text-xl font-bold">關鍵技術指標</h2>
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
              <div className="bg-gray-800 rounded-2xl border border-gray-700 p-6 shadow-xl">
                <div className="flex items-center space-x-2 mb-4 text-gray-300">
                  <PieChart size={24} />
                  <h2 className="text-xl font-bold">基本面評估</h2>
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
