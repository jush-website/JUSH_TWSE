import React, { useState, useEffect, useRef } from 'react';
import { getCapitalFlow, getNews, getCapitalFlowAiCommentary } from '../services/api';
import { Link } from 'react-router-dom';
import { ArrowRight, BarChart3, TrendingUp, Layers, AlertCircle, RefreshCw, Flame, X, Sparkles } from 'lucide-react';
import ProgressLoader from '../components/ProgressLoader';
import gsap from 'gsap';
import { useGSAP } from '@gsap/react';
import { useCardAnimation } from '../hooks/useCardAnimation';

const CapitalFlowHeatmap = () => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedIndustry, setSelectedIndustry] = useState(null);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [aiSummary, setAiSummary] = useState(null);
  const [aiLoading, setAiLoading] = useState(false);
  const aiRequested = useRef(false); // 只打一次，3 分鐘輪詢不重打省 NIM 額度

  // 資料到齊後，把產業資金分布 + 新聞題材送 NIM 產出熱門產業摘要
  useEffect(() => {
    if (!data || data.length === 0 || aiRequested.current) return;
    aiRequested.current = true;
    setAiLoading(true);
    (async () => {
      let news = { taiwan: [], global: [] };
      try { news = (await getNews()).data || news; } catch { /* 沒新聞照樣能解讀 */ }
      const text = await getCapitalFlowAiCommentary({
        industries: data.slice(0, 10).map(i =>
          `${i.industry} 比重${i.value_ratio}%/漲跌${i.avg_change_pct > 0 ? '+' : ''}${i.avg_change_pct}%`),
        taiwan_news: (news.taiwan || []).slice(0, 10).map(n => n.title),
        global_news: (news.global || []).slice(0, 5).map(n => n.title),
      });
      setAiSummary(text);
      setAiLoading(false);
    })();
  }, [data]);

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        const res = await getCapitalFlow();
        if (Array.isArray(res.data)) {
          // Backward compatibility: res.data is a list of industries
          setData(res.data);
        } else {
          // Fallback just in case some cached data is still in dictionary format
          setData(res.data.industries || []);
        }
        setLastUpdated(res.updated_at);
        const indData = Array.isArray(res.data) ? res.data : res.data.industries;
        if (indData && indData.length > 0) {
          // 在電腦版 (>=1024px) 預設選中第一筆，手機版則不選中，避免直接跳出彈窗
          if (window.innerWidth >= 1024) {
            setSelectedIndustry(indData[0]);
          }
        }
      } catch (err) {
        setError(err.message || '無法取得資金流向資料');
      } finally {
        setLoading(false);
      }
    };
    fetchData();
    const interval = setInterval(fetchData, 3 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);


  const containerRef = useCardAnimation('.gsap-heatmap-block', [data], {
    enabled: data && data.length > 0,
    y: 0, scale: 0.8, duration: 0.5, stagger: 0.05, ease: 'back.out(1.2)',
  });

  useGSAP(() => {
    if (!selectedIndustry) return;
    gsap.fromTo('.gsap-modal-overlay', { opacity: 0 }, { opacity: 1, duration: 0.3 });
    gsap.fromTo('.gsap-modal-content', { scale: 0.8, y: 50, opacity: 0 }, { scale: 1, y: 0, opacity: 1, duration: 0.5, ease: 'back.out(1.5)' });
  }, { scope: containerRef, dependencies: [selectedIndustry] });

  if (loading) return (
    <div className="flex flex-col items-center justify-center py-20 space-y-4">
      <ProgressLoader progress={50} status="載入資金流向資料中..." />
    </div>
  );
  
  if (error) return (
    <div className="text-center py-20 text-red-400">
      <AlertCircle className="w-12 h-12 mx-auto mb-3 opacity-50" />
      <p>{error}</p>
    </div>
  );
  if (!data || data.length === 0) {
    return (
      <div className="text-center py-20">
        <AlertCircle className="w-10 h-10 text-ink-3 mx-auto mb-3" />
        <h2 className="font-semibold text-ink-1">目前尚無資金流向資料</h2>
        <p className="text-ink-3 text-sm mt-1">請稍後再試，或確認後端排程是否已執行</p>
      </div>
    );
  }

  // Helper to determine block color based on performance (Taiwan: Red = Up, Green = Down)
  const getBlockColor = (changePct) => {
    if (changePct >= 3) return 'bg-red-600 border-red-500';
    if (changePct >= 1) return 'bg-red-500/80 border-red-400/50';
    if (changePct > 0) return 'bg-red-400/50 border-red-300/30';
    if (changePct <= -3) return 'bg-green-600 border-green-500';
    if (changePct <= -1) return 'bg-green-500/80 border-green-400/50';
    if (changePct < 0) return 'bg-green-400/50 border-green-300/30';
    return 'bg-overlay border-line';
  };

  // Helper to determine block size based on volume ratio
  const getBlockSize = (ratio) => {
    if (ratio >= 15) return 'col-span-2 row-span-2 md:col-span-3 md:row-span-2 min-h-[160px]';
    if (ratio >= 8) return 'col-span-2 row-span-1 min-h-[120px]';
    if (ratio >= 4) return 'col-span-1 row-span-2 min-h-[120px]';
    return 'col-span-1 row-span-1 min-h-[80px]';
  };

  // Format money
  const formatMoney = (val) => {
    if (val >= 100000000) return `${(val / 100000000).toFixed(2)}億`;
    if (val >= 10000) return `${(val / 10000).toFixed(0)}萬`;
    return val.toString();
  };

  const industryDetailsContent = selectedIndustry ? (
    <>
      <div className="flex justify-between items-start mb-4 pb-4 border-b border-line pr-8">
        <div>
          <h2 className="text-lg font-bold text-ink-1">{selectedIndustry.industry}</h2>
          <p className="text-xs text-ink-3 mt-0.5">市場資金佔比 {selectedIndustry.value_ratio}%</p>
        </div>
        <div className={`text-xl font-bold nums ${selectedIndustry.avg_change_pct >= 0 ? 'text-bull' : 'text-bear'}`}>
          {selectedIndustry.avg_change_pct > 0 ? '+' : ''}{selectedIndustry.avg_change_pct}%
        </div>
      </div>

      <div className="mb-4">
        <h3 className="text-xs font-semibold text-ink-3 uppercase tracking-wider mb-3 flex items-center gap-1.5">
          <TrendingUp size={12} />
          板塊代表標的（依成交值）
        </h3>
        <div className="space-y-2">
          {selectedIndustry.top_stocks?.map((stock, idx) => (
            <Link
              to={`/analyze/${stock.id}`}
              key={idx}
              className="group flex items-center justify-between p-3 rounded-xl bg-overlay border border-line hover:border-brand/30 hover:bg-brand-muted transition-colors"
            >
              <div>
                <div className="font-semibold text-ink-1 group-hover:text-brand transition-colors text-sm flex items-center gap-1.5">
                  {stock.name}
                  <span className="text-[10px] text-ink-3 font-mono">{stock.id}</span>
                </div>
                <div className="text-[10px] text-ink-3 mt-0.5">成交值 {formatMoney(stock.value)}</div>
              </div>
              <div className="text-right">
                <div className="text-sm font-medium text-ink-1 nums">${stock.price}</div>
                <div className={`text-xs font-bold mt-0.5 nums ${stock.change_pct >= 0 ? 'text-bull' : 'text-bear'}`}>
                  {stock.change_pct > 0 ? '+' : ''}{stock.change_pct}%
                </div>
              </div>
            </Link>
          ))}
          {(!selectedIndustry.top_stocks || selectedIndustry.top_stocks.length === 0) && (
            <div className="text-center py-6 text-ink-3 text-sm">無代表標的資料</div>
          )}
        </div>
      </div>

      <div className="p-3 bg-brand-muted border border-brand/20 rounded-lg">
        <p className="text-xs text-ink-2 leading-relaxed">
          <strong className="text-brand">分析提示：</strong> 若某產業的「資金佔比」連續幾日放大，且「平均漲幅」維持正值，代表法人與熱錢正積極流入該板塊，是短波段操作的首選目標。
        </p>
      </div>
    </>
  ) : null;

  return (
    <div ref={containerRef} className="space-y-5 pb-20">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Layers size={18} className="text-ink-3" />
            <h1 className="text-xl font-bold text-ink-1">資金流向板塊</h1>
          </div>
          <p className="text-ink-3 text-sm">色塊大小代表成交比重，顏色深淺代表平均漲跌幅</p>
        </div>
        {lastUpdated && (
          <div className="flex items-center gap-1.5 text-xs text-ink-3 bg-overlay px-3 py-1.5 rounded-full border border-line w-fit">
            <RefreshCw size={11} />
            資料時間：{lastUpdated}
          </div>
        )}
      </div>

      {/* AI 熱門產業摘要：產業資金分布 + 新聞題材 */}
      {(aiLoading || aiSummary) && (
        <div className="p-4 sm:p-5 rounded-xl bg-brand-muted/50 border border-brand/15 flex items-start gap-2.5">
          <Sparkles size={15} className="text-brand shrink-0 mt-0.5" />
          <div className="min-w-0">
            <div className="text-xs font-semibold text-brand mb-1">AI 熱門產業解讀</div>
            {aiLoading ? (
              <div className="space-y-2">
                <div className="h-4 w-full max-w-lg bg-brand/10 rounded animate-pulse" />
                <div className="h-4 w-3/4 max-w-md bg-brand/10 rounded animate-pulse" />
              </div>
            ) : (
              <p className="text-sm text-ink-2 leading-relaxed">{aiSummary}</p>
            )}
          </div>
        </div>
      )}

      <div className="grid lg:grid-cols-3 gap-6">
        {/* Heatmap Section */}
        <div className="lg:col-span-2 space-y-4">
          <div className="card p-4 sm:p-5">
            <h2 className="font-semibold text-ink-1 mb-4 flex items-center gap-2">
              <Flame size={16} className="text-bull" />
              產業熱力圖
            </h2>
            <div className="grid grid-cols-3 md:grid-cols-6 gap-2 auto-rows-min">
              {data.map((ind, idx) => (
                <div
                  key={idx}
                  onClick={() => setSelectedIndustry(ind)}
                  className={`
                    cursor-pointer rounded-xl border p-3 flex flex-col justify-between gsap-heatmap-block transition-colors duration-300 hover:scale-[1.02] hover:shadow-lg hover:shadow-blue-500/20 hover:z-10 relative overflow-hidden
                    ${getBlockColor(ind.avg_change_pct)}
                    ${getBlockSize(ind.value_ratio)}
                    ${selectedIndustry?.industry === ind.industry ? 'ring-2 ring-white/60' : ''}
                  `}
                >
                  <div className="relative z-10">
                    <div className="font-bold text-white text-sm sm:text-base leading-tight drop-shadow-md truncate">
                      {ind.industry}
                    </div>
                    <div className="text-white/90 text-xs sm:text-sm font-medium mt-1">
                      {ind.value_ratio}%
                    </div>
                  </div>
                  <div className="relative z-10 flex justify-between items-end mt-2">
                    <div className="text-xs text-white/70 drop-shadow-sm hidden sm:block">
                      {formatMoney(ind.total_value_ntd)}
                    </div>
                    <div className="text-white font-bold drop-shadow-md text-sm">
                      {ind.avg_change_pct > 0 ? '+' : ''}{ind.avg_change_pct}%
                    </div>
                  </div>
                </div>
              ))}
            </div>
            
            <div className="mt-4 flex flex-wrap items-center justify-center gap-2 text-xs text-ink-3">
              <span>空</span>
              <div className="w-3.5 h-3.5 bg-green-600 rounded"></div>
              <div className="w-3.5 h-3.5 bg-green-500/70 rounded"></div>
              <div className="w-3.5 h-3.5 bg-green-400/40 rounded"></div>
              <div className="w-3.5 h-3.5 bg-line rounded mx-1"></div>
              <div className="w-3.5 h-3.5 bg-red-400/40 rounded"></div>
              <div className="w-3.5 h-3.5 bg-red-500/70 rounded"></div>
              <div className="w-3.5 h-3.5 bg-red-600 rounded"></div>
              <span>多</span>
            </div>
          </div>
        </div>

        {/* Desktop sidebar */}
        <div className="hidden lg:block lg:col-span-1">
          <div className="card p-4 sm:p-5 sticky top-20">
            {selectedIndustry ? industryDetailsContent : (
              <div className="text-center py-10 text-ink-3 text-sm">
                點擊左側熱力圖查看產業細節
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Mobile modal */}
      <div className={`lg:hidden fixed inset-0 z-50 flex items-center justify-center p-4 ${selectedIndustry ? 'visible' : 'invisible'}`}>
        <div className="gsap-modal-overlay absolute inset-0 bg-black/50" onClick={() => setSelectedIndustry(null)} />
        <div className="gsap-modal-content card p-5 relative z-10 w-full max-w-md max-h-[85vh] overflow-y-auto shadow-card-lg">
          <button
            onClick={() => setSelectedIndustry(null)}
            className="absolute top-4 right-4 p-1.5 text-ink-3 hover:text-ink-1 bg-overlay hover:bg-line rounded-lg transition-colors"
          >
            <X size={16} />
          </button>
          {industryDetailsContent}
        </div>
      </div>
    </div>
  );
};

export default CapitalFlowHeatmap;
