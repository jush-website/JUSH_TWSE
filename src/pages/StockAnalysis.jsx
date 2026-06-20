import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { analyzeStockRaw } from '../services/api';
import { 
  TrendingUp, TrendingDown, AlertCircle, CheckCircle, 
  Target, ShieldAlert, BarChart, PieChart, Info, Search
, Newspaper, FileText, BarChart2 } from 'lucide-react';
import { 
  ResponsiveContainer, ComposedChart, Line, Bar, XAxis, YAxis, Tooltip, Legend, CartesianGrid, Cell, Area
} from 'recharts';
import BranchAnalysis from '../components/BranchAnalysis';
import LightweightChart from '../components/LightweightChart';
import gsap from 'gsap';
import { useGSAP } from '@gsap/react';

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

  const containerRef = React.useRef(null);

  useGSAP(() => {
    if (data) {
      gsap.from('.gsap-card', {
        y: 30,
        opacity: 0,
        duration: 0.8,
        stagger: 0.15,
        ease: "power3.out"
      });
      const scoreObj = { val: 0 };
      gsap.to(scoreObj, {
        val: data.total_score || 0,
        duration: 1.5,
        ease: "power2.out",
        onUpdate: () => {
          const el = document.querySelector('.gsap-score');
          if (el) el.innerHTML = Math.round(scoreObj.val);
        }
      });
    }
  }, { scope: containerRef, dependencies: [data] });

  useGSAP(() => {
    if (data) {
      gsap.fromTo('.gsap-tab-content', 
        { opacity: 0, y: 15 },
        { opacity: 1, y: 0, duration: 0.4, ease: "power2.out" }
      );
    }
  }, { scope: containerRef, dependencies: [activeTab] });

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
  }));

  return (
    <div ref={containerRef} className="max-w-6xl mx-auto space-y-4 sm:space-y-6">
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
          <div className="gsap-card bg-gray-800/80 backdrop-blur-xl rounded-2xl border border-gray-700/50 p-4 sm:p-6 shadow-2xl hover:border-blue-500/30 transition-all duration-500 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 sm:gap-6">
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
                <div className={`gsap-score text-3xl sm:text-5xl font-black ${
                  data.total_score >= 70 ? 'text-red-500' : 
                  data.total_score >= 50 ? 'text-orange-500' : 'text-gray-400'
                }`}>
                  {data.total_score}
                </div>
              </div>
              <div className="text-sm font-bold text-blue-400 sm:mt-2 text-right sm:text-center">{data.recommend_status}</div>
            </div>

          </div>

          {/* Tabs Menu */}
          <div className="gsap-card flex space-x-2 overflow-x-auto bg-gray-800 p-2 rounded-2xl border border-gray-700 shadow-xl scrollbar-hide">
            {[
              { id: 'dashboard', label: '綜合分析' },
              { id: 'chips', label: '籌碼分析' },
              { id: 'branch', label: '分點籌碼' },
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

          {activeTab === 'dashboard' && (
            <div className="gsap-tab-content space-y-4 sm:space-y-6\">
              {/* Charts Section */}
              {data.chart_data && data.chart_data.length > 0 && (
                <div className="w-full">
                  <LightweightChart data={data.chart_data} />
                </div>
              )}

              <div className="grid lg:grid-cols-3 gap-4 sm:gap-6">
                {/* Strategy & Target Section */}
                <div className="lg:col-span-2 space-y-4 sm:space-y-6">
                  {/* Strategy Card */}
                  <div className="bg-gradient-to-br from-blue-900/30 to-purple-900/30 rounded-2xl border border-blue-800/50 p-4 sm:p-6 shadow-xl">
                    <div className="flex flex-wrap items-center gap-2 mb-3 sm:mb-4 text-blue-300">
                      <Target size={20} className="sm:w-6 sm:h-6" />
                      <h2 className="text-lg sm:text-xl font-bold">進場策略建議</h2>
                      {data.can_enter && (
                        <span className="bg-gray-900/50 text-white text-[11px] sm:text-sm px-3 py-1 rounded-full border border-gray-700 ml-auto font-bold">
                          {data.can_enter}
                        </span>
                      )}
                    </div>
                    <div className="grid sm:grid-cols-3 gap-3 sm:gap-4">
                      <div className="bg-gray-900/60 p-3 sm:p-4 rounded-xl">
                        <div className="text-gray-400 text-[11px] sm:text-xs mb-1">建議策略</div>
                        <div className="text-base sm:text-lg font-bold text-white">{data.strategy_name}</div>
                      </div>
                      <div className="bg-gray-900/60 p-3 sm:p-4 rounded-xl">
                        <div className="text-gray-400 text-[11px] sm:text-xs mb-1">進場價位</div>
                        <div className="text-base sm:text-lg font-bold text-green-400">{data.entry_range}</div>
                      </div>
                      <div className="bg-gray-900/60 p-3 sm:p-4 rounded-xl">
                        <div className="text-gray-400 text-[11px] sm:text-xs mb-1">停損價位</div>
                        <div className="text-base sm:text-lg font-bold text-red-400">{data.stop_loss}</div>
                      </div>
                    </div>
                    {data.strategy_notes && data.strategy_notes.length > 0 && (
                      <div className="mt-4 p-3 bg-blue-900/20 border border-blue-900/50 rounded-lg flex flex-col space-y-1 text-blue-200 text-sm">
                        {data.strategy_notes.map((note, idx) => (
                          <div key={idx} className="flex items-start space-x-2">
                            <span className="text-blue-400">•</span>
                            <span>{note}</span>
                          </div>
                        ))}
                      </div>
                    )}
                    {data.exit_rule && (
                      <div className="mt-3 p-3 bg-red-900/20 border border-red-900/50 rounded-lg flex items-center space-x-2 text-red-300 text-sm">
                        <ShieldAlert size={18} className="flex-shrink-0" />
                        <span className="font-bold">出場鐵律：{data.exit_rule}</span>
                      </div>
                    )}
                  </div>

                  {/* Volume Patterns Section */}
                  {data.volume_patterns && data.volume_patterns.length > 0 && (
                    <div className="bg-gray-800/80 backdrop-blur-xl rounded-2xl border border-gray-700/50 p-4 sm:p-6 shadow-2xl hover:border-blue-500/30 transition-all duration-500">
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

                  {/* CDP Card */}
                  {data.cdp && (
                    <div className="bg-gray-800/80 backdrop-blur-xl rounded-2xl border border-gray-700/50 p-4 sm:p-6 shadow-2xl hover:border-blue-500/30 transition-all duration-500 space-y-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-2 text-purple-400">
                          <Target size={20} className="sm:w-6 sm:h-6" />
                          <h2 className="text-lg sm:text-xl font-bold">CDP 走勢預測</h2>
                        </div>
                        {data.cdp.base_date && (
                          <span className="text-[10px] sm:text-xs bg-purple-900/40 text-purple-300 px-2 py-1 rounded">
                            基準日: {data.cdp.base_date}
                          </span>
                        )}
                      </div>
                      
                      <div className="grid grid-cols-5 gap-1 sm:gap-4 text-center">
                        <div className="bg-red-950/40 border border-red-900/50 p-2 sm:p-3 rounded-xl">
                          <div className="text-red-400 text-[9px] sm:text-xs font-bold mb-1">AH</div>
                          <div className="text-xs sm:text-lg font-black text-red-300">{data.cdp.AH}</div>
                          <div className="text-[9px] sm:text-[10px] text-gray-500 mt-1 hidden sm:block">突破追買</div>
                        </div>
                        <div className="bg-orange-950/40 border border-orange-900/30 p-2 sm:p-3 rounded-xl">
                          <div className="text-orange-400 text-[9px] sm:text-xs font-bold mb-1">NH</div>
                          <div className="text-xs sm:text-lg font-black text-orange-300">{data.cdp.NH}</div>
                          <div className="text-[9px] sm:text-[10px] text-gray-500 mt-1 hidden sm:block">高壓遇阻</div>
                        </div>
                        <div className="bg-gray-900/80 border border-gray-700 p-2 sm:p-3 rounded-xl">
                          <div className="text-gray-300 text-[9px] sm:text-xs font-bold mb-1">CDP</div>
                          <div className="text-xs sm:text-lg font-black text-white">{data.cdp.CDP}</div>
                          <div className="text-[9px] sm:text-[10px] text-gray-500 mt-1 hidden sm:block">多空分界</div>
                        </div>
                        <div className="bg-green-950/40 border border-green-900/30 p-2 sm:p-3 rounded-xl">
                          <div className="text-green-400 text-[9px] sm:text-xs font-bold mb-1">NL</div>
                          <div className="text-xs sm:text-lg font-black text-green-300">{data.cdp.NL}</div>
                          <div className="text-[9px] sm:text-[10px] text-gray-500 mt-1 hidden sm:block">低檔買進</div>
                        </div>
                        <div className="bg-emerald-950/40 border border-emerald-900/50 p-2 sm:p-3 rounded-xl">
                          <div className="text-emerald-400 text-[9px] sm:text-xs font-bold mb-1">AL</div>
                          <div className="text-xs sm:text-lg font-black text-emerald-300">{data.cdp.AL}</div>
                          <div className="text-[9px] sm:text-[10px] text-gray-500 mt-1 hidden sm:block">跌破追賣</div>
                        </div>
                      </div>

                      {data.cdp.signals && data.cdp.signals.length > 0 && (
                        <div className="flex flex-wrap gap-2 pt-2">
                          {data.cdp.signals.map((sig, sIdx) => (
                            <span key={sIdx} className="bg-purple-900/30 text-purple-300 text-[10px] sm:text-xs px-2.5 py-1 rounded-full border border-purple-800/30">
                              {sig}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Diagnosis Details */}
                  <div className="bg-gray-800/80 backdrop-blur-xl rounded-2xl border border-gray-700/50 p-4 sm:p-6 shadow-2xl hover:border-blue-500/30 transition-all duration-500">
                    <div className="flex items-center space-x-2 mb-3 sm:mb-4 text-gray-300">
                      <Activity size={20} className="sm:w-6 sm:h-6" />
                      <h2 className="text-lg sm:text-xl font-bold">專業診斷報告</h2>
                    </div>
                    <div className="space-y-2 sm:space-y-3">
                      {data.diagnosis && data.diagnosis.map((line, idx) => (
                        <div key={idx} className="flex items-start space-x-2 sm:space-x-3 p-2.5 sm:p-3 bg-gray-900/40 rounded-xl hover:bg-gray-900/60 transition">
                          <div className="mt-0.5 sm:mt-1">
                            {line.includes('!!!') || line.includes('警告') ? <ShieldAlert className="text-red-500 w-4 h-4 sm:w-5 sm:h-5" /> : 
                             line.includes('看多') || line.includes('強勢') ? <TrendingUp className="text-red-400 w-4 h-4 sm:w-5 sm:h-5" /> :
                             <CheckCircle className="text-blue-400 w-4 h-4 sm:w-5 sm:h-5" />}
                          </div>
                          <p className="text-gray-200 text-sm sm:text-base leading-relaxed">{line}</p>
                        </div>
                      ))}
                      {(!data.diagnosis || data.diagnosis.length === 0) && (
                        <div className="text-gray-400 text-sm sm:text-base p-2">
                          目前暫無此標的的診斷報告，可能為新上市櫃或資料尚未完備。
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Technical Indicators Sidebar */}
                <div className="space-y-4 sm:space-y-6">
                  <div className="bg-gray-800/80 backdrop-blur-xl rounded-2xl border border-gray-700/50 p-4 sm:p-6 shadow-2xl hover:border-blue-500/30 transition-all duration-500">
                    <div className="flex items-center space-x-2 mb-3 sm:mb-4 text-gray-300">
                      <BarChart size={20} className="sm:w-6 sm:h-6" />
                      <h2 className="text-lg sm:text-xl font-bold">關鍵技術指標</h2>
                    </div>
                    <div className="space-y-4">
                      {[
                        { label: 'KD 指標', value: data.kd, color: 'text-orange-400' },
                        { label: 'RSI 強度', value: data.rsi, color: data.rsi > 70 ? 'text-red-400' : 'text-blue-400' },
                        { label: 'MACD 趨勢', value: data.macd, color: data.macd?.includes('多') ? 'text-red-400' : 'text-green-400' },
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
                  <div className="bg-gray-800/80 backdrop-blur-xl rounded-2xl border border-gray-700/50 p-4 sm:p-6 shadow-2xl hover:border-blue-500/30 transition-all duration-500">
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
                    <div className="mt-4 space-y-2 border-t border-gray-700/50 pt-4">
                      <div className="text-[11px] sm:text-xs text-gray-400">
                        <span className="text-blue-400 font-bold">本益比 (PE)</span>：評估股價是否合理的指標，越低代表回本越快。
                      </div>
                      <div className="text-[11px] sm:text-xs text-gray-400">
                        <span className="text-blue-400 font-bold">殖利率</span>：每年配息金額除以股價，越高代表領取的現金股利越多。
                      </div>
                      <div className="text-[11px] sm:text-xs text-gray-400">
                        <span className="text-blue-400 font-bold">ROE (股東權益報酬率)</span>：公司利用股東資金獲利的能力，越高賺錢效率越好。
                      </div>
                      <div className="text-[11px] sm:text-xs text-gray-400">
                        <span className="text-blue-400 font-bold">負債比</span>：衡量公司財務槓桿與風險的指標，過高代表財務壓力大。
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}


          {activeTab === 'chips' && (
            <div className="gsap-tab-content space-y-4 sm:space-y-6\">
              {(!data.chip_processed?.length && !data.margin_processed?.length && !data.shareholding_processed?.length) && (
                <div className="flex flex-col items-center justify-center p-12 bg-gray-800 rounded-2xl border border-gray-700 shadow-xl">
                  <Info className="w-12 h-12 text-gray-500 mb-4" />
                  <p className="text-gray-400 text-lg font-bold">此標的目前無相關籌碼資料</p>
                  <p className="text-gray-500 text-sm mt-2">可能是 ETF、新上市或目前尚無歷史數據</p>
                </div>
              )}
              {/* 法人買賣超 */}
              {data.chip_processed && data.chip_processed.length > 0 && (
                <div className="bg-gray-800/80 backdrop-blur-xl rounded-2xl border border-gray-700/50 p-4 sm:p-6 shadow-2xl hover:border-blue-500/30 transition-all duration-500 h-[400px]">
                  <h2 className="text-lg font-bold text-gray-300 mb-4">三大法人買賣超 (張)</h2>
                  <div className="w-full overflow-x-auto pb-2 custom-scrollbar">
                      <div style={{ minWidth: 700 }} className="h-[280px] sm:h-[300px]">
                        <ResponsiveContainer width="100%" height="100%">
                      <ComposedChart data={data.chip_processed.slice(-60)} margin={{ top: 10, right: 35, left: 35, bottom: 0 }}>
                        
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
<CartesianGrid strokeDasharray="3 3" stroke="#374151" vertical={false} opacity={0.4} />
                        <XAxis dataKey="date" stroke="#9CA3AF" fontSize={10} tickMargin={5} />
                        <YAxis stroke="#9CA3AF" fontSize={10} />
                        <Tooltip contentStyle={{ backgroundColor: 'rgba(17, 24, 39, 0.8)', backdropFilter: 'blur(8px)', borderColor: '#374151', color: '#fff', borderRadius: '12px', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.5)' }} cursor={{fill: 'rgba(255,255,255,0.05)'}} />
                        <Legend />
                        <Bar dataKey="foreign_net" name="外資淨買賣" fill="#3B82F6" />
                        <Bar dataKey="trust_net" name="投信淨買賣" fill="#10B981" />
                      </ComposedChart>
                    </ResponsiveContainer>
                      </div>
                    </div>
                  </div>
              )}
              {/* 資券變化 */}
              {data.margin_processed && data.margin_processed.length > 0 && (
                <div className="bg-gray-800/80 backdrop-blur-xl rounded-2xl border border-gray-700/50 p-4 sm:p-6 shadow-2xl hover:border-blue-500/30 transition-all duration-500 h-[400px]">
                  <h2 className="text-lg font-bold text-gray-300 mb-4">融資融券餘額 (張)</h2>
                  <div className="w-full overflow-x-auto pb-2 custom-scrollbar">
                      <div style={{ minWidth: 700 }} className="h-[280px] sm:h-[300px]">
                        <ResponsiveContainer width="100%" height="100%">
                      <ComposedChart data={data.margin_processed.slice(-60)} margin={{ top: 10, right: 35, left: 35, bottom: 0 }}>
                        
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
<CartesianGrid strokeDasharray="3 3" stroke="#374151" vertical={false} opacity={0.4} />
                        <XAxis dataKey="date" stroke="#9CA3AF" fontSize={10} tickMargin={5} />
                        <YAxis yAxisId="left" stroke="#F87171" fontSize={10} />
                        <YAxis yAxisId="right" orientation="right" stroke="#60A5FA" fontSize={10} />
                        <Tooltip contentStyle={{ backgroundColor: 'rgba(17, 24, 39, 0.8)', backdropFilter: 'blur(8px)', borderColor: '#374151', color: '#fff', borderRadius: '12px', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.5)' }} cursor={{fill: 'rgba(255,255,255,0.05)'}} />
                        <Legend />
                        <Area yAxisId="left" type="monotone" dataKey="margin_bal" name="融資餘額" stroke="#F87171" strokeWidth={2.5} fillOpacity={1} fill="url(#colorMargin)" activeDot={{ r: 5, strokeWidth: 0, fill: "#FCA5A5", filter: "url(#glow)" }} />
                        <Area yAxisId="right" type="monotone" dataKey="short_bal" name="融券餘額" stroke="#60A5FA" strokeWidth={2.5} fillOpacity={1} fill="url(#colorShort)" activeDot={{ r: 5, strokeWidth: 0, fill: "#93C5FD", filter: "url(#glow)" }} />
                      </ComposedChart>
                    </ResponsiveContainer>
                      </div>
                    </div>
                  </div>
              )}
              {/* 外資持股比例 */}
              {data.shareholding_processed && data.shareholding_processed.length > 0 && (
                <div className="bg-gray-800/80 backdrop-blur-xl rounded-2xl border border-gray-700/50 p-4 sm:p-6 shadow-2xl hover:border-blue-500/30 transition-all duration-500 h-[400px]">
                  <h2 className="text-lg font-bold text-gray-300 mb-4">外資持股比例 (%)</h2>
                  <div className="w-full overflow-x-auto pb-2 custom-scrollbar">
                      <div style={{ minWidth: 700 }} className="h-[280px] sm:h-[300px]">
                        <ResponsiveContainer width="100%" height="100%">
                      <ComposedChart data={data.shareholding_processed.slice(-60)} margin={{ top: 10, right: 35, left: 35, bottom: 0 }}>
                        
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
<CartesianGrid strokeDasharray="3 3" stroke="#374151" vertical={false} opacity={0.4} />
                        <XAxis dataKey="date" stroke="#9CA3AF" fontSize={10} tickMargin={5} />
                        <YAxis domain={['auto', 'auto']} stroke="#9CA3AF" fontSize={10} />
                        <Tooltip contentStyle={{ backgroundColor: 'rgba(17, 24, 39, 0.8)', backdropFilter: 'blur(8px)', borderColor: '#374151', color: '#fff', borderRadius: '12px', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.5)' }} cursor={{fill: 'rgba(255,255,255,0.05)'}} />
                        <Legend />
                        <Area type="monotone" dataKey="ratio" name="持股比例" stroke="#A78BFA" strokeWidth={3} fillOpacity={1} fill="url(#colorRatio)" activeDot={{ r: 6, strokeWidth: 0, fill: "#C4B5FD", filter: "url(#glow)" }} />
                      </ComposedChart>
                    </ResponsiveContainer>
                      </div>
                    </div>
                  </div>
              )}
            </div>
          )}

          {activeTab === 'branch' && (
            <BranchAnalysis stockId={data?.stock_id} />
          )}

          {activeTab === 'fundamentals' && (
            <div className="gsap-tab-content space-y-4 sm:space-y-6\">
              {(!data.revenue_data?.length && !data.financial_data?.length) && (
                <div className="flex flex-col items-center justify-center p-12 bg-gray-800 rounded-2xl border border-gray-700 shadow-xl">
                  <Info className="w-12 h-12 text-gray-500 mb-4" />
                  <p className="text-gray-400 text-lg font-bold">此標的目前無相關基本面資料</p>
                  <p className="text-gray-500 text-sm mt-2">可能是 ETF 等不適用一般財報分析之標的</p>
                </div>
              )}
              {/* 月營收 */}
              {data.revenue_data && data.revenue_data.length > 0 && (
                <div className="bg-gray-800/80 backdrop-blur-xl rounded-2xl border border-gray-700/50 p-4 sm:p-6 shadow-2xl hover:border-blue-500/30 transition-all duration-500 h-[400px]">
                  <h2 className="text-lg font-bold text-gray-300 mb-4">月營收與年增率</h2>
                  <div className="w-full overflow-x-auto pb-2 custom-scrollbar">
                      <div style={{ minWidth: 700 }} className="h-[280px] sm:h-[300px]">
                        <ResponsiveContainer width="100%" height="100%">
                      <ComposedChart data={data.revenue_data.slice(-36).map(d => ({ date: d.date, rev: d.revenue/100000000, yoy: d.revenue_year_on_year }))} margin={{ top: 10, right: 35, left: 35, bottom: 0 }}>
                        
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
<CartesianGrid strokeDasharray="3 3" stroke="#374151" vertical={false} opacity={0.4} />
                        <XAxis dataKey="date" stroke="#9CA3AF" fontSize={10} tickMargin={5} />
                        <YAxis yAxisId="left" stroke="#9CA3AF" fontSize={10} />
                        <YAxis yAxisId="right" orientation="right" stroke="#F59E0B" fontSize={10} />
                        <Tooltip contentStyle={{ backgroundColor: 'rgba(17, 24, 39, 0.8)', backdropFilter: 'blur(8px)', borderColor: '#374151', color: '#fff', borderRadius: '12px', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.5)' }} cursor={{fill: 'rgba(255,255,255,0.05)'}} />
                        <Legend />
                        <Bar yAxisId="left" dataKey="rev" name="月營收(億)" fill="#3B82F6" opacity={0.85} radius={[4, 4, 0, 0]} />
                        <Line yAxisId="right" type="monotone" dataKey="yoy" name="年增率(%)" stroke="#FBBF24" strokeWidth={3} dot={{ r: 4, fill: "#FBBF24", strokeWidth: 0 }} activeDot={{ r: 6, filter: "url(#glow)" }} filter="url(#glow)" />
                      </ComposedChart>
                    </ResponsiveContainer>
                      </div>
                    </div>
                  </div>
              )}
              {/* EPS */}
              {data.financial_data && data.financial_data.filter(d => d.type === 'EPS').length > 0 && (
                <div className="bg-gray-800/80 backdrop-blur-xl rounded-2xl border border-gray-700/50 p-4 sm:p-6 shadow-2xl hover:border-blue-500/30 transition-all duration-500 h-[400px]">
                  <h2 className="text-lg font-bold text-gray-300 mb-4">每股盈餘 (EPS)</h2>
                  <div className="w-full overflow-x-auto pb-2 custom-scrollbar">
                      <div style={{ minWidth: 700 }} className="h-[280px] sm:h-[300px]">
                        <ResponsiveContainer width="100%" height="100%">
                      <ComposedChart data={data.financial_data.filter(d => d.type === 'EPS').slice(-12)} margin={{ top: 10, right: 35, left: 35, bottom: 0 }}>
                        
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
<CartesianGrid strokeDasharray="3 3" stroke="#374151" vertical={false} opacity={0.4} />
                        <XAxis dataKey="date" stroke="#9CA3AF" fontSize={10} tickMargin={5} />
                        <YAxis stroke="#9CA3AF" fontSize={10} />
                        <Tooltip contentStyle={{ backgroundColor: 'rgba(17, 24, 39, 0.8)', backdropFilter: 'blur(8px)', borderColor: '#374151', color: '#fff', borderRadius: '12px', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.5)' }} cursor={{fill: 'rgba(255,255,255,0.05)'}} />
                        <Legend />
                        <Bar dataKey="value" name="EPS(元)" fill="#34D399" opacity={0.85} radius={[4, 4, 0, 0]} />
                      </ComposedChart>
                    </ResponsiveContainer>
                      </div>
                    </div>
                  </div>
              )}
              {/* 財報 Table */}
              {data.financial_data && data.financial_data.length > 0 && (
                <div className="bg-gray-800/80 backdrop-blur-xl rounded-2xl border border-gray-700/50 p-4 sm:p-6 shadow-2xl hover:border-blue-500/30 transition-all duration-500 overflow-x-auto">
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
            <div className="gsap-tab-content space-y-4 sm:space-y-6\">
              <div className="bg-gray-800/80 backdrop-blur-xl rounded-2xl border border-gray-700/50 p-4 sm:p-6 shadow-2xl hover:border-blue-500/30 transition-all duration-500">
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
