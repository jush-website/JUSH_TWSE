import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api, { analyzeStockRaw, getStockAnalysisCommentary, getIntegratedAnalysis } from '../services/api';
import {
  TrendingUp, TrendingDown, AlertCircle, CheckCircle,
  Target, ShieldAlert, BarChart, PieChart, Info, Search, Sparkles
, Newspaper, FileText, BarChart2 } from 'lucide-react';
import { 
  ResponsiveContainer, ComposedChart, Line, Bar, XAxis, YAxis, Tooltip, Legend, CartesianGrid, Cell, Area
} from 'recharts';
import BranchAnalysis from '../components/BranchAnalysis';
import LightweightChart from '../components/LightweightChart';
import gsap from 'gsap';
import { useGSAP } from '@gsap/react';
import { useCardAnimation } from '../hooks/useCardAnimation';
import CountUp from '../components/bits/CountUp';

// 頁面五張 recharts 圖共用的漸層/glow 定義（原本同一份 <defs> 複製了五次）
const CHART_DEFS = (
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
);

const StockAnalysis = () => {
  const { query: urlQuery } = useParams();
  const navigate = useNavigate();
  const [query, setQuery] = useState(urlQuery || '');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState('dashboard');
  const [aiCommentary, setAiCommentary] = useState(null);
  const [aiCommentaryLoading, setAiCommentaryLoading] = useState(false);
  // AI 整合分析：{ status: 'loading' | 'done' | 'error', text }，換股票時重置
  const [aiReport, setAiReport] = useState(null);

  const fetchAnalysis = async (searchQuery) => {
    if (!searchQuery) return;
    setLoading(true);
    setError(null);
    setAiCommentary(null);
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

  // 搜尋完成、各項報告（技術指標/診斷/CDP/基本面）都算好後，
  // 非阻塞地請後端把這些節錄送去給 AI 產生一段綜合解讀。
  // 失敗或沒設定金鑰時 getStockAnalysisCommentary 回傳 null，區塊直接不顯示。
  useEffect(() => {
    if (!data) return;
    let cancelled = false;
    setAiCommentaryLoading(true);
    getStockAnalysisCommentary({
      stock_name: data.stock_name, stock_id: data.stock_id,
      price: data.price, change_percent: data.change_percent, category: data.category,
      total_score: data.total_score, recommend_status: data.recommend_status,
      kd: data.kd, rsi: data.rsi, macd: data.macd,
      ma5: data.ma5, ma20: data.ma20, ma60: data.ma60,
      vol_ratio: data.vol_ratio, volatility: data.volatility,
      pe: data.pe, yield: data.yield, roe: data.roe, debt_ratio: data.debt_ratio,
      diagnosis: data.diagnosis, volume_patterns: (data.volume_patterns || []).map(vp => vp.pattern),
      cdp: data.cdp, strategy_name: data.strategy_name,
      entry_range: data.entry_range, stop_loss: data.stop_loss, exit_rule: data.exit_rule,
    }).then(text => {
      if (!cancelled) setAiCommentary(text);
    }).finally(() => {
      if (!cancelled) setAiCommentaryLoading(false);
    });
    return () => { cancelled = true; };
  }, [data]);

  // AI 整合分析：切到該分頁時才觸發（分點資料 + LLM 呼叫較慢，不預先打）。
  // 把五個面向濃縮成文字節錄送後端，由 NVIDIA NIM 產出分段報告。
  const fetchIntegratedReport = async () => {
    if (!data) return;
    setAiReport({ status: 'loading' });

    // 分點與 PTT 輿情要另外打 API，並行抓（其餘面向都已在 data 裡）
    let branchSummary = null;
    let communitySummary = null;
    await Promise.all([
      (async () => {
        try {
          const res = await api.get(`/api/stock/${data.stock_id}/branch-data`);
          const b = res.data?.data;
          if (b) {
            const fmt = (arr) => (arr || []).slice(0, 5)
              .map(x => `${x.name} ${x.net_buy > 0 ? '+' : ''}${x.net_buy.toLocaleString()}張(均價${x.price?.toFixed?.(2) ?? x.price})`)
              .join('、');
            branchSummary = `買超前五：${fmt(b.buy_branches) || '無'}；賣超前五：${fmt(b.sell_branches) || '無'}`;
          }
        } catch { /* 無分點資料時後端會標示無資料 */ }
      })(),
      (async () => {
        try {
          const res = await api.get(`/api/stock/${data.stock_id}/ptt`, { params: { name: data.stock_name } });
          const posts = res.data?.data || [];
          if (posts.length > 0) {
            communitySummary = posts.slice(0, 10)
              .map(p => `${p.date} ${p.title}(推文數${p.push || '0'})`).join('；');
          }
        } catch { /* 抓不到就標示無資料 */ }
      })(),
    ]);

    const sign = (v) => (v > 0 ? `+${v}` : `${v}`);
    let chipSummary = (data.chip_processed || []).slice(-5)
      .map(c => `${c.date} 外資${sign(c.foreign_net)}張/投信${sign(c.trust_net)}張`).join('；');
    const lastMargin = (data.margin_processed || []).slice(-1)[0];
    const lastHold = (data.shareholding_processed || []).slice(-1)[0];
    if (lastMargin) chipSummary += `。融資餘額 ${lastMargin.margin_bal} 張、融券餘額 ${lastMargin.short_bal} 張`;
    if (lastHold) chipSummary += `。外資持股比例 ${lastHold.ratio}%`;

    // K 線節錄：近 20 日逐日 OHLCV + 近 60 日高低點，讓 AI 能解讀實際價格型態
    let klineSummary = null;
    const bars = data.chart_data || [];
    if (bars.length > 0) {
      const win60 = bars.slice(-60);
      const hi60 = Math.max(...win60.map(b => b.high));
      const lo60 = Math.min(...win60.map(b => b.low));
      const daily = bars.slice(-20)
        .map(b => `${b.date} 開${b.open} 高${b.high} 低${b.low} 收${b.close} 量${b.volume}張`)
        .join('；');
      klineSummary = `近60日最高 ${hi60}、最低 ${lo60}，目前收盤 ${bars[bars.length - 1].close}。近20日日K：${daily}`;
    }

    const revs = (data.revenue_data || []).slice(-3)
      .map(r => `${r.date} 營收 ${(r.revenue / 1e8).toFixed(1)} 億(年增 ${r.revenue_year_on_year}%)`).join('、');
    const eps = (data.financial_data || []).filter(d => d.type === 'EPS').slice(-4)
      .map(e => `${e.date} EPS ${e.value}`).join('、');
    const fundamentalSummary = [revs, eps].filter(Boolean).join('；') || null;

    const text = await getIntegratedAnalysis({
      stock_name: data.stock_name, stock_id: data.stock_id,
      price: data.price, change_percent: data.change_percent, category: data.category,
      total_score: data.total_score, recommend_status: data.recommend_status,
      kd: data.kd, rsi: data.rsi, macd: data.macd,
      ma5: data.ma5, ma20: data.ma20, ma60: data.ma60,
      vol_ratio: data.vol_ratio, volatility: data.volatility,
      pe: data.pe, yield: data.yield, roe: data.roe, debt_ratio: data.debt_ratio,
      diagnosis: data.diagnosis, volume_patterns: (data.volume_patterns || []).map(vp => vp.pattern),
      kline_summary: klineSummary,
      chip_summary: chipSummary || null,
      branch_summary: branchSummary,
      community_summary: communitySummary,
      fundamental_summary: fundamentalSummary,
      // 帶日期讓 AI 能對照 K 線日期，推測股價受哪些新聞題材影響
      news_titles: (data.news_data || []).slice().reverse().slice(0, 15).map(n => `${n.date} ${n.title}`),
    });
    setAiReport(text ? { status: 'done', text } : { status: 'error' });
  };

  useEffect(() => { setAiReport(null); }, [data]);
  useEffect(() => {
    if (activeTab === 'ai' && data && !aiReport) fetchIntegratedReport();
  }, [activeTab, data]);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (query.trim()) {
      navigate(`/analyze/${query}`);
    }
  };

  const isPositive = data?.change_percent >= 0;

  const scoreRef = React.useRef(null);

  const containerRef = useCardAnimation('.gsap-card', [data, loading], {
    enabled: data && !loading, duration: 0.8, stagger: 0.15, ease: 'power3.out',
  });

  useGSAP(() => {
    if (!data || loading) return;
    const scoreObj = { val: 0 };
    gsap.to(scoreObj, {
      val: data.total_score || 0,
      duration: 1.5,
      ease: 'power2.out',
      onUpdate: () => {
        if (scoreRef.current) scoreRef.current.innerHTML = Math.round(scoreObj.val);
      },
    });
  }, { scope: containerRef, dependencies: [data, loading] });

  useGSAP(() => {
    if (!data || loading) return;
    gsap.fromTo('.gsap-tab-content',
      { opacity: 0, y: 15 },
      { opacity: 1, y: 0, duration: 0.4, ease: 'power2.out' }
    );
  }, { scope: containerRef, dependencies: [activeTab, data, loading] });

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
      {/* Search */}
      <div className="card p-4 sm:p-5">
        <form onSubmit={handleSubmit} className="flex gap-2 sm:gap-3">
          <div className="relative flex-1">
            <input
              type="text"
              placeholder="輸入股票代號或名稱（例：2330 或 台積電）"
              className="w-full bg-overlay border border-line rounded-xl py-2.5 pl-9 pr-4 text-sm text-ink-1 placeholder:text-ink-3 focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand"
              value={query}
              onChange={e => setQuery(e.target.value)}
            />
            <Search className="absolute left-3 top-3 text-ink-3" size={15} />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="bg-brand text-brand-fg px-5 sm:px-7 py-2.5 rounded-xl font-semibold text-sm transition hover:opacity-90 disabled:opacity-50 whitespace-nowrap"
          >
            {loading ? '分析中...' : '開始診斷'}
          </button>
        </form>
      </div>

      {error && (
        <div className="card p-4 flex items-start gap-3 border-bull/30 bg-bull-muted">
          <AlertCircle size={17} className="text-bull shrink-0 mt-0.5" />
          <span className="text-sm text-ink-1">{error}</span>
        </div>
      )}

      {loading && (
        <div className="text-center py-16">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-2 border-brand border-t-transparent mb-4"></div>
          <p className="text-ink-3 text-sm">正在讀取雲端數據並計算技術指標...</p>
        </div>
      )}

      {data && !loading && (
        <div className="space-y-4 sm:space-y-5">
          {/* Header Summary */}
          <div className="gsap-card card p-4 sm:p-5 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <div className="flex items-center gap-3 sm:gap-4">
              <div className={`p-3 rounded-xl ${isPositive ? 'bg-bull-muted text-bull' : 'bg-bear-muted text-bear'}`}>
                {isPositive ? <TrendingUp size={28} /> : <TrendingDown size={28} />}
              </div>
              <div>
                <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
                  <h1 className="text-xl sm:text-2xl font-bold text-ink-1">{data.stock_name}</h1>
                  <span className="text-base text-ink-3 font-mono">{data.stock_id}</span>
                  <span className="bg-overlay text-ink-3 text-[10px] px-2 py-0.5 rounded border border-line">{data.category}</span>
                </div>
                <div className="flex items-center gap-2 sm:gap-4 mt-1.5 flex-wrap">
                  <span className="text-2xl sm:text-3xl font-bold text-ink-1 nums"><CountUp value={data.price} /></span>
                  <span className={`text-base font-bold nums ${isPositive ? 'text-bull' : 'text-bear'}`}>
                    {isPositive ? '+' : ''}{data.change_percent}%
                  </span>
                  <span className="text-xs text-ink-3 hidden sm:inline">昨收 {data.yesterday_close}</span>
                </div>
              </div>
            </div>

            <div className="flex flex-row sm:flex-col items-center justify-between sm:justify-center bg-overlay p-3 sm:p-5 rounded-xl border border-line w-full sm:w-auto sm:min-w-[140px]">
              <div className="flex sm:block flex-col sm:text-center">
                <div className="text-ink-3 text-xs mb-0 sm:mb-1">系統綜合評分</div>
                <div ref={scoreRef} className={`gsap-score text-3xl sm:text-4xl font-black nums ${
                  data.total_score >= 70 ? 'text-bull' :
                  data.total_score >= 50 ? 'text-yellow-500' : 'text-ink-3'
                }`}>
                  {data.total_score}
                </div>
              </div>
              <div className="text-sm font-semibold text-brand sm:mt-2 text-right sm:text-center">{data.recommend_status}</div>
            </div>
          </div>

          {/* AI 綜合解讀：把上面各項已算好的報告整合成一段話，純敘述不重算分數 */}
          {(aiCommentaryLoading || aiCommentary) && (
            <div className="gsap-card p-4 sm:p-5 rounded-xl bg-brand-muted/50 border border-brand/15 flex items-start gap-2.5">
              <Sparkles size={15} className="text-brand shrink-0 mt-0.5" />
              <div className="min-w-0">
                <div className="text-xs font-semibold text-brand mb-1">AI 綜合解讀</div>
                {aiCommentaryLoading ? (
                  <div className="h-4 w-3/4 max-w-sm bg-brand/10 rounded animate-pulse" />
                ) : (
                  <p className="text-sm text-ink-2 leading-relaxed">{aiCommentary}</p>
                )}
              </div>
            </div>
          )}

          {/* Tabs */}
          <div className="gsap-card bg-panel border border-line p-1.5 rounded-xl flex gap-1 overflow-x-auto">
            {[
              { id: 'dashboard', label: '綜合分析' },
              { id: 'chips', label: '籌碼分析' },
              { id: 'branch', label: '分點籌碼' },
              { id: 'fundamentals', label: '基本面' },
              { id: 'news', label: '個股新聞' },
              { id: 'ai', label: '✨ AI 整合分析' }
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`px-4 sm:px-5 py-2 rounded-lg font-medium text-sm whitespace-nowrap transition-all ${
                  activeTab === tab.id
                    ? 'bg-brand text-brand-fg shadow-sm'
                    : 'text-ink-2 hover:bg-overlay hover:text-ink-1'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {activeTab === 'dashboard' && (
            <div className="gsap-tab-content space-y-4 sm:space-y-5">
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
                  <div className="card p-4 sm:p-5">
                    <div className="flex flex-wrap items-center gap-2 mb-3 sm:mb-4 text-brand">
                      <Target size={16} />
                      <h2 className="text-lg sm:text-xl font-bold">進場策略建議</h2>
                      {data.can_enter && (
                        <span className="bg-overlay text-ink-2 text-xs px-3 py-1 rounded-full border border-line ml-auto font-medium">
                          {data.can_enter}
                        </span>
                      )}
                    </div>
                    <div className="grid sm:grid-cols-3 gap-3">
                      <div className="bg-overlay p-3 rounded-xl">
                        <div className="text-ink-3 text-xs mb-1">建議策略</div>
                        <div className="font-semibold text-ink-1">{data.strategy_name}</div>
                      </div>
                      <div className="bg-overlay p-3 rounded-xl">
                        <div className="text-ink-3 text-xs mb-1">進場價位</div>
                        <div className="font-semibold text-bear nums">{data.entry_range}</div>
                      </div>
                      <div className="bg-overlay p-3 rounded-xl">
                        <div className="text-ink-3 text-xs mb-1">停損價位</div>
                        <div className="font-semibold text-bull nums">{data.stop_loss}</div>
                      </div>
                    </div>
                    {data.strategy_notes && data.strategy_notes.length > 0 && (
                      <div className="mt-3 p-3 bg-brand-muted border border-brand/20 rounded-lg flex flex-col gap-1">
                        {data.strategy_notes.map((note, idx) => (
                          <div key={idx} className="flex items-start gap-2 text-sm text-ink-2">
                            <span className="text-brand mt-0.5">•</span>
                            <span>{note}</span>
                          </div>
                        ))}
                      </div>
                    )}
                    {data.exit_rule && (
                      <div className="mt-2 p-3 bg-bull-muted border border-bull/20 rounded-lg flex items-center gap-2 text-bull text-sm">
                        <ShieldAlert size={14} className="shrink-0" />
                        <span className="font-semibold">出場鐵律：{data.exit_rule}</span>
                      </div>
                    )}
                  </div>

                  {/* Volume Patterns Section */}
                  {data.volume_patterns && data.volume_patterns.length > 0 && (
                    <div className="card p-4 sm:p-5">
                      <div className="flex items-center gap-2 mb-3 text-ink-2">
                        <BarChart size={15} />
                        <h2 className="font-semibold text-ink-1">成交量形態診斷</h2>
                      </div>
                      <div className="grid sm:grid-cols-2 gap-3">
                        {data.volume_patterns.map((vp, idx) => {
                          const cls = vp.status === 'positive'
                            ? 'bg-bull-muted border-bull/20 text-bull'
                            : vp.status === 'negative'
                            ? 'bg-bear-muted border-bear/20 text-bear'
                            : 'bg-overlay border-line text-ink-2';
                          return (
                            <div key={idx} className={`p-3 rounded-xl border ${cls}`}>
                              <div className="font-semibold text-sm mb-0.5">{vp.pattern}</div>
                              <div className="text-xs opacity-75">{vp.desc}</div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* CDP Card */}
                  {data.cdp && (
                    <div className="card p-4 sm:p-5 space-y-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2 text-brand">
                          <Target size={15} />
                          <h2 className="font-semibold text-ink-1">CDP 走勢預測</h2>
                        </div>
                        {data.cdp.base_date && (
                          <span className="text-xs bg-overlay text-ink-3 px-2 py-1 rounded border border-line">
                            基準日: {data.cdp.base_date}
                          </span>
                        )}
                      </div>

                      <div className="grid grid-cols-5 gap-1 sm:gap-3 text-center">
                        <div className="bg-bull-muted border border-bull/20 p-2 sm:p-3 rounded-xl">
                          <div className="text-bull text-[9px] sm:text-xs font-bold mb-1">AH</div>
                          <div className="text-xs sm:text-base font-bold text-bull nums">{data.cdp.AH}</div>
                          <div className="text-[9px] text-ink-3 mt-1 hidden sm:block">突破追買</div>
                        </div>
                        <div className="bg-orange-50 dark:bg-orange-950/30 border border-orange-200 dark:border-orange-900/30 p-2 sm:p-3 rounded-xl">
                          <div className="text-orange-500 text-[9px] sm:text-xs font-bold mb-1">NH</div>
                          <div className="text-xs sm:text-base font-bold text-orange-500 nums">{data.cdp.NH}</div>
                          <div className="text-[9px] text-ink-3 mt-1 hidden sm:block">高壓遇阻</div>
                        </div>
                        <div className="bg-overlay border border-line p-2 sm:p-3 rounded-xl">
                          <div className="text-ink-3 text-[9px] sm:text-xs font-bold mb-1">CDP</div>
                          <div className="text-xs sm:text-base font-bold text-ink-1 nums">{data.cdp.CDP}</div>
                          <div className="text-[9px] text-ink-3 mt-1 hidden sm:block">多空分界</div>
                        </div>
                        <div className="bg-bear-muted border border-bear/20 p-2 sm:p-3 rounded-xl">
                          <div className="text-bear text-[9px] sm:text-xs font-bold mb-1">NL</div>
                          <div className="text-xs sm:text-base font-bold text-bear nums">{data.cdp.NL}</div>
                          <div className="text-[9px] text-ink-3 mt-1 hidden sm:block">低檔買進</div>
                        </div>
                        <div className="bg-bear-muted border border-bear/20 p-2 sm:p-3 rounded-xl">
                          <div className="text-bear text-[9px] sm:text-xs font-bold mb-1">AL</div>
                          <div className="text-xs sm:text-base font-bold text-bear nums">{data.cdp.AL}</div>
                          <div className="text-[9px] text-ink-3 mt-1 hidden sm:block">跌破追賣</div>
                        </div>
                      </div>

                      {data.cdp.signals && data.cdp.signals.length > 0 && (
                        <div className="flex flex-wrap gap-2 pt-1">
                          {data.cdp.signals.map((sig, sIdx) => (
                            <span key={sIdx} className="bg-brand-muted text-brand text-xs px-2.5 py-1 rounded-full border border-brand/20">
                              {sig}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  <div className="card p-4 sm:p-5">
                    <div className="flex items-center gap-2 mb-3 text-ink-2">
                      <Activity size={15} />
                      <h2 className="font-semibold text-ink-1">專業診斷報告</h2>
                    </div>
                    <div className="space-y-2">
                      {data.diagnosis && data.diagnosis.map((line, idx) => (
                        <div key={idx} className="flex items-start gap-2.5 p-2.5 bg-overlay rounded-lg hover:bg-line/40 transition-colors">
                          <div className="mt-0.5 shrink-0">
                            {line.includes('!!!') || line.includes('警告')
                              ? <ShieldAlert size={14} className="text-bull" />
                              : line.includes('看多') || line.includes('強勢')
                              ? <TrendingUp size={14} className="text-bull" />
                              : <CheckCircle size={14} className="text-brand" />}
                          </div>
                          <p className="text-ink-2 text-sm leading-relaxed">{line}</p>
                        </div>
                      ))}
                      {(!data.diagnosis || data.diagnosis.length === 0) && (
                        <div className="text-ink-3 text-sm p-2">
                          目前暫無此標的的診斷報告，可能為新上市櫃或資料尚未完備。
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Technical Indicators Sidebar */}
                <div className="space-y-4 sm:space-y-6">
                  <div className="card p-4 sm:p-5">
                    <div className="flex items-center gap-2 mb-3 text-ink-2">
                      <BarChart size={15} />
                      <h2 className="font-semibold text-ink-1">關鍵技術指標</h2>
                    </div>
                    <div className="space-y-2.5">
                      {[
                        { label: 'KD 指標', value: data.kd, color: 'text-orange-500' },
                        { label: 'RSI 強度', value: data.rsi, color: data.rsi > 70 ? 'text-bull' : 'text-brand' },
                        { label: 'MACD 趨勢', value: data.macd, color: data.macd?.includes('多') ? 'text-bull' : 'text-bear' },
                        { label: '5日均線', value: data.ma5, color: 'text-ink-1' },
                        { label: '20日月線', value: data.ma20, color: 'text-ink-1' },
                        { label: '60日季線', value: data.ma60, color: 'text-ink-1' },
                        { label: '量能比例', value: data.vol_ratio, color: data.vol_ratio > 1.5 ? 'text-orange-500' : 'text-ink-2' },
                        { label: '年化波動率', value: `${data.volatility}%`, color: 'text-ink-2' }
                      ].map(item => (
                        <div key={item.label} className="flex justify-between items-center border-b border-line pb-2">
                          <span className="text-ink-3 text-sm">{item.label}</span>
                          <span className={`font-semibold text-sm nums ${item.color}`}>{item.value}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="card p-4 sm:p-5">
                    <div className="flex items-center gap-2 mb-3 text-ink-2">
                      <PieChart size={15} />
                      <h2 className="font-semibold text-ink-1">基本面評估</h2>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="bg-overlay p-3 rounded-xl text-center">
                        <div className="text-ink-3 text-[10px] uppercase mb-0.5">本益比 PE</div>
                        <div className="font-semibold text-ink-1 nums">{data.pe}</div>
                      </div>
                      <div className="bg-overlay p-3 rounded-xl text-center">
                        <div className="text-ink-3 text-[10px] uppercase mb-0.5">殖利率 %</div>
                        <div className="font-semibold text-ink-1 nums">{data.yield === '-' ? '-' : `${data.yield}%`}</div>
                      </div>
                      <div className="bg-overlay p-3 rounded-xl text-center">
                        <div className="text-ink-3 text-[10px] uppercase mb-0.5">ROE %</div>
                        <div className="font-semibold text-ink-1 nums">{data.roe === '-' ? '-' : `${data.roe}%`}</div>
                      </div>
                      <div className="bg-overlay p-3 rounded-xl text-center">
                        <div className="text-ink-3 text-[10px] uppercase mb-0.5">負債比 %</div>
                        <div className="font-semibold text-ink-1 nums">{data.debt_ratio === '-' ? '-' : `${data.debt_ratio}%`}</div>
                      </div>
                    </div>
                    <div className="mt-3 space-y-1.5 border-t border-line pt-3">
                      <div className="text-xs text-ink-3">
                        <span className="text-brand font-semibold">本益比</span>：評估股價合理性，越低回本越快。
                      </div>
                      <div className="text-xs text-ink-3">
                        <span className="text-brand font-semibold">殖利率</span>：年配息除以股價，越高現金流越好。
                      </div>
                      <div className="text-xs text-ink-3">
                        <span className="text-brand font-semibold">ROE</span>：利用股東資金獲利的能力，越高越好。
                      </div>
                      <div className="text-xs text-ink-3">
                        <span className="text-brand font-semibold">負債比</span>：財務槓桿指標，過高代表財務壓力大。
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}


          {activeTab === 'chips' && (
            <div className="gsap-tab-content space-y-4 sm:space-y-5">
              {(!data.chip_processed?.length && !data.margin_processed?.length && !data.shareholding_processed?.length) && (
                <div className="card p-12 flex flex-col items-center justify-center text-center">
                  <Info className="w-10 h-10 text-ink-3 mb-3" />
                  <p className="text-ink-2 font-semibold">此標的目前無相關籌碼資料</p>
                  <p className="text-ink-3 text-sm mt-1">可能是 ETF、新上市或目前尚無歷史數據</p>
                </div>
              )}
              {/* 法人買賣超 */}
              {data.chip_processed && data.chip_processed.length > 0 && (
                <div className="card p-4 sm:p-5 h-[400px]">
                  <h2 className="font-semibold text-ink-1 mb-3">三大法人買賣超 (張)</h2>
                  <div className="w-full overflow-x-auto pb-2 custom-scrollbar">
                      <div style={{ minWidth: 700 }} className="h-[280px] sm:h-[300px]">
                        <ResponsiveContainer width="100%" height="100%">
                      <ComposedChart data={data.chip_processed.slice(-60)} margin={{ top: 10, right: 35, left: 35, bottom: 0 }}>
                        
                      {CHART_DEFS}
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
                <div className="card p-4 sm:p-5 h-[400px]">
                  <h2 className="font-semibold text-ink-1 mb-3">融資融券餘額 (張)</h2>
                  <div className="w-full overflow-x-auto pb-2 custom-scrollbar">
                      <div style={{ minWidth: 700 }} className="h-[280px] sm:h-[300px]">
                        <ResponsiveContainer width="100%" height="100%">
                      <ComposedChart data={data.margin_processed.slice(-60)} margin={{ top: 10, right: 35, left: 35, bottom: 0 }}>
                        
                      {CHART_DEFS}
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
                <div className="card p-4 sm:p-5 h-[400px]">
                  <h2 className="font-semibold text-ink-1 mb-3">外資持股比例 (%)</h2>
                  <div className="w-full overflow-x-auto pb-2 custom-scrollbar">
                      <div style={{ minWidth: 700 }} className="h-[280px] sm:h-[300px]">
                        <ResponsiveContainer width="100%" height="100%">
                      <ComposedChart data={data.shareholding_processed.slice(-60)} margin={{ top: 10, right: 35, left: 35, bottom: 0 }}>
                        
                      {CHART_DEFS}
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
            <div className="gsap-tab-content space-y-4 sm:space-y-5">
              {(!data.revenue_data?.length && !data.financial_data?.length) && (
                <div className="card p-12 flex flex-col items-center justify-center text-center">
                  <Info className="w-10 h-10 text-ink-3 mb-3" />
                  <p className="text-ink-2 font-semibold">此標的目前無相關基本面資料</p>
                  <p className="text-ink-3 text-sm mt-1">可能是 ETF 等不適用一般財報分析之標的</p>
                </div>
              )}
              {/* 月營收 */}
              {data.revenue_data && data.revenue_data.length > 0 && (
                <div className="card p-4 sm:p-5 h-[400px]">
                  <h2 className="font-semibold text-ink-1 mb-3">月營收與年增率</h2>
                  <div className="w-full overflow-x-auto pb-2 custom-scrollbar">
                      <div style={{ minWidth: 700 }} className="h-[280px] sm:h-[300px]">
                        <ResponsiveContainer width="100%" height="100%">
                      <ComposedChart data={data.revenue_data.slice(-36).map(d => ({ date: d.date, rev: d.revenue/100000000, yoy: d.revenue_year_on_year }))} margin={{ top: 10, right: 35, left: 35, bottom: 0 }}>
                        
                      {CHART_DEFS}
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
                <div className="card p-4 sm:p-5 h-[400px]">
                  <h2 className="font-semibold text-ink-1 mb-3">每股盈餘 (EPS)</h2>
                  <div className="w-full overflow-x-auto pb-2 custom-scrollbar">
                      <div style={{ minWidth: 700 }} className="h-[280px] sm:h-[300px]">
                        <ResponsiveContainer width="100%" height="100%">
                      <ComposedChart data={data.financial_data.filter(d => d.type === 'EPS').slice(-12)} margin={{ top: 10, right: 35, left: 35, bottom: 0 }}>
                        
                      {CHART_DEFS}
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
                <div className="card p-4 sm:p-5 overflow-x-auto">
                  <h2 className="font-semibold text-ink-1 mb-3">綜合損益表 (部分)</h2>
                  <table className="w-full text-left text-sm whitespace-nowrap">
                    <thead className="bg-overlay">
                      <tr>
                        <th className="p-2.5 text-ink-3 font-medium text-xs">日期</th>
                        <th className="p-2.5 text-ink-3 font-medium text-xs">項目</th>
                        <th className="p-2.5 text-ink-3 font-medium text-xs">數值</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-line">
                      {data.financial_data.slice(-50).map((item, idx) => (
                        <tr key={idx} className="hover:bg-overlay transition-colors">
                          <td className="p-2.5 text-ink-3 text-xs font-mono">{item.date}</td>
                          <td className="p-2.5 text-ink-2 text-xs">{item.type}</td>
                          <td className="p-2.5 text-ink-1 text-xs nums">{item.value?.toLocaleString()}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {activeTab === 'ai' && (
            <div className="gsap-tab-content space-y-4 sm:space-y-5">
              {aiReport?.status === 'loading' && (
                <div className="card p-12 flex flex-col items-center justify-center text-center">
                  <Sparkles className="w-8 h-8 text-brand mb-3 animate-pulse" />
                  <p className="text-ink-2 font-semibold">AI 正在整合五大面向資料...</p>
                  <p className="text-ink-3 text-sm mt-1">綜合分析 / 籌碼 / 分點 / 基本面 / 新聞，約需 10~30 秒</p>
                </div>
              )}
              {aiReport?.status === 'error' && (
                <div className="card p-12 flex flex-col items-center justify-center text-center">
                  <AlertCircle className="w-10 h-10 text-ink-3 mb-3" />
                  <p className="text-ink-2 font-semibold">AI 整合分析暫時無法使用</p>
                  <p className="text-ink-3 text-sm mt-1">可能是 AI 服務未設定或額度用盡，請稍後再試</p>
                  <button
                    onClick={fetchIntegratedReport}
                    className="mt-4 bg-brand text-brand-fg px-5 py-2 rounded-xl font-semibold text-sm transition hover:opacity-90"
                  >
                    重新產生
                  </button>
                </div>
              )}
              {aiReport?.status === 'done' && (
                <>
                  <div className="grid sm:grid-cols-2 gap-4 sm:gap-5">
                    {parseAiReport(aiReport.text).filter(s => s.title !== '整體結論').map((sec, idx) => (
                      <div key={idx} className="card p-4 sm:p-5">
                        {sec.title && (
                          <div className="flex items-center gap-2 mb-2 text-brand">
                            <Sparkles size={14} />
                            <h2 className="font-semibold text-ink-1 text-sm">{sec.title}</h2>
                          </div>
                        )}
                        <p className="text-sm text-ink-2 leading-relaxed">{sec.body.join(' ')}</p>
                      </div>
                    ))}
                  </div>
                  {parseAiReport(aiReport.text).filter(s => s.title === '整體結論').map((sec, idx) => (
                    <div key={idx} className="p-4 sm:p-5 rounded-xl bg-brand-muted/50 border border-brand/15">
                      <div className="flex items-center gap-2 mb-2 text-brand">
                        <Sparkles size={15} />
                        <h2 className="font-bold text-ink-1">整體結論</h2>
                      </div>
                      <p className="text-sm text-ink-2 leading-relaxed">{sec.body.join(' ')}</p>
                    </div>
                  ))}
                  <p className="text-xs text-ink-3 text-center">
                    本報告由 AI 依系統既有數據自動整理，僅為資訊解讀，不構成投資建議。
                  </p>
                </>
              )}
            </div>
          )}

          {activeTab === 'news' && (
            <div className="gsap-tab-content space-y-4 sm:space-y-5">
              <div className="card p-4 sm:p-5">
                <h2 className="font-semibold text-ink-1 mb-3">個股相關新聞</h2>
                {data.news_data && data.news_data.length > 0 ? (
                  <div className="divide-y divide-line">
                    {data.news_data.slice().reverse().slice(0, 30).map((news, idx) => (
                      <a key={idx} href={news.link} target="_blank" rel="noreferrer"
                        className="block py-3 hover:bg-overlay -mx-1 px-1 rounded-lg transition-colors group">
                        <div className="text-xs text-ink-3 mb-1">{news.date}</div>
                        <h3 className="text-sm font-medium text-ink-1 group-hover:text-brand transition-colors">{news.title}</h3>
                      </a>
                    ))}
                  </div>
                ) : (
                  <div className="text-ink-3 text-center py-10 text-sm">暫無近期新聞</div>
                )}
              </div>
              <PttDiscussion stockId={data.stock_id} stockName={data.stock_name} />
            </div>
          )}


        </div>
      )}
    </div>
  );
};

// PTT 股板討論列表：個股新聞分頁下方顯示，抓不到就整塊不顯示
const PttDiscussion = ({ stockId, stockName }) => {
  const [posts, setPosts] = useState(null);

  useEffect(() => {
    if (!stockId) return;
    let cancelled = false;
    api.get(`/api/stock/${stockId}/ptt`, { params: { name: stockName } })
      .then(res => { if (!cancelled) setPosts(res.data?.data || []); })
      .catch(() => { if (!cancelled) setPosts([]); });
    return () => { cancelled = true; };
  }, [stockId]);

  if (!posts || posts.length === 0) return null;

  return (
    <div className="card p-4 sm:p-5">
      <h2 className="font-semibold text-ink-1 mb-3">PTT 股板討論</h2>
      <div className="divide-y divide-line">
        {posts.map((p, idx) => (
          <a key={idx} href={p.url} target="_blank" rel="noreferrer"
            className="flex items-center gap-3 py-2.5 hover:bg-overlay -mx-1 px-1 rounded-lg transition-colors group">
            <span className={`shrink-0 w-8 text-center text-xs font-bold nums ${
              p.push === '爆' ? 'text-bull' : p.push?.startsWith('X') ? 'text-bear' : 'text-ink-3'
            }`}>{p.push || '-'}</span>
            <span className="text-xs text-ink-3 shrink-0 w-10">{p.date}</span>
            <span className="text-sm text-ink-1 group-hover:text-brand transition-colors truncate">{p.title}</span>
          </a>
        ))}
      </div>
      <p className="mt-2 text-[10px] text-ink-3">資料來源：PTT Stock 板標題搜尋，推文數僅代表討論熱度，非投資建議。</p>
    </div>
  );
};

// 把 AI 回傳的「【標題】內文」分段文字解析成 [{ title, body: [] }]
// 模型沒照格式輸出時，整段當成無標題內文顯示，不會壞版
const parseAiReport = (text) => {
  const sections = [];
  let cur = null;
  (text || '').split('\n').forEach(raw => {
    const line = raw.trim();
    if (!line) return;
    const m = line.match(/^【(.+?)】\s*(.*)/);
    if (m) {
      cur = { title: m[1], body: m[2] ? [m[2]] : [] };
      sections.push(cur);
    } else if (cur) {
      cur.body.push(line);
    } else {
      cur = { title: null, body: [line] };
      sections.push(cur);
    }
  });
  return sections;
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
