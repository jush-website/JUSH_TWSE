import React, { useState, useEffect } from 'react';
import api from '../services/api';
import { BarChart2, AlertCircle, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

const MarketDistribution = () => {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedBucket, setSelectedBucket] = useState(null);
  const navigate = useNavigate();

  useEffect(() => {
    const fetchData = async () => {
      try {
        const res = await api.get('/api/market-distribution');
        setData(res.data.data || res.data);
        setError(null);
      } catch (err) {
        console.error("Fetch market distribution error:", err);
        setError(err.message || '無法取得分佈資料');
      } finally {
        setLoading(false);
      }
    };
    fetchData();
    const interval = setInterval(fetchData, 2 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  const handleBarClick = (item) => {
    if (item.count > 0) {
      setSelectedBucket(item);
    }
  };

  const handleClose = () => setSelectedBucket(null);

  const handleStockClick = (stockId) => {
    navigate(`/analyze/${stockId}`);
    setSelectedBucket(null);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="flex flex-col items-center gap-3">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand"></div>
          <p className="text-ink-3 text-sm">載入大盤分佈資料中...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="card p-6 flex flex-col items-center max-w-md text-center">
          <AlertCircle className="w-10 h-10 text-bull mb-3" />
          <h2 className="text-base font-semibold text-ink-1 mb-2">資料載入失敗</h2>
          <p className="text-ink-3 text-sm">{error}</p>
        </div>
      </div>
    );
  }

  const maxCount = Math.max(...data.map(d => d.count), 1);

  return (
    <div className="py-4">
      <div className="mb-5 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-ink-1 flex items-center gap-2">
            <BarChart2 size={18} className="text-ink-3" />
            大盤漲跌分佈圖
          </h1>
          <p className="text-ink-3 text-sm mt-0.5">全市場上市櫃個股今日漲跌幅分佈｜點擊長條查看熱門標的</p>
        </div>
      </div>

      <div className="card p-3 sm:p-6 relative">
        <div className="relative h-[350px] sm:h-[440px] w-full mt-2 flex">
          <div className="w-10 sm:w-12 flex flex-col justify-between py-4 text-[10px] sm:text-xs text-ink-3 pr-2 sm:pr-3 text-right border-r border-line">
            {[4, 3, 2, 1, 0].map((line) => (
              <span key={line}>{Math.round(maxCount * (line / 4))}</span>
            ))}
          </div>

          {/* Bars Area */}
          <div className="flex-1 relative pl-2 sm:pl-3">
            {/* Y Grid Lines */}
            <div className="absolute inset-0 pl-2 sm:pl-3 pointer-events-none flex flex-col justify-between py-4">
              {[4, 3, 2, 1, 0].map((line) => (
                <div key={line} className="w-full border-t border-line/40"></div>
              ))}
            </div>

            {/* Bars */}
            <div className="absolute inset-0 pl-2 sm:pl-3 py-4 flex items-end justify-between gap-[2px] sm:gap-1.5 z-10">
              {data.map((item) => {
                const isPositive = item.bucket > 0;
                const isZero = item.bucket === 0;
                const heightPercent = (item.count / maxCount) * 100;

                // Premium Gradient Colors
                let barClass = 'bg-line hover:bg-ink-3';
                if (isPositive)  barClass = 'bg-bull/70 hover:bg-bull';
                else if (!isZero) barClass = 'bg-bear/70 hover:bg-bear';

                const isClickable = item.count > 0;
                const isSelected = selectedBucket?.bucket === item.bucket;

                return (
                  <div
                    key={item.bucket}
                    className={`relative flex flex-col justify-end flex-1 group h-full ${isClickable ? 'cursor-pointer' : 'cursor-default'}`}
                    onClick={() => handleBarClick(item)}
                  >
                    {/* The Bar */}
                    <div
                      className={`w-full rounded-t-sm transition-all duration-300 ${barClass} ${isSelected ? 'ring-2 ring-brand/60 z-20' : ''}`}
                      style={{
                        height: `${Math.max(heightPercent, item.count === 0 ? 0.5 : 1)}%`,
                        opacity: item.count === 0 ? 0.2 : 1
                      }}
                    ></div>

                    {/* Tooltip */}
                    <div className="absolute -top-10 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity z-50 text-[10px] font-medium bg-panel border border-line px-2.5 py-1.5 rounded-lg whitespace-nowrap pointer-events-none shadow-card-md flex items-center gap-1">
                      <span className={isPositive ? 'text-bull font-bold' : isZero ? 'text-ink-2' : 'text-bear font-bold'}>
                        {item.bucket > 0 ? `+${item.bucket}` : item.bucket}%
                      </span>
                      <span className="text-line px-0.5">|</span>
                      <span className="text-ink-1">{item.count} 家</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* X Axis Labels */}
        <div className="flex ml-10 sm:ml-12 pl-2 sm:pl-3 mt-3 gap-[2px] sm:gap-1.5">
          {data.map((item) => (
            <div key={item.bucket} className="flex-1 flex justify-center">
              {/* Show all labels on md+ screens */}
              <span className="text-[10px] sm:text-[11px] text-ink-3 font-medium whitespace-nowrap hidden md:block">
                {item.bucket > 0 ? `+${item.bucket}` : item.bucket}
              </span>
              {/* Show alternating or key labels on smaller screens to prevent overlap */}
              <span className="text-[9px] text-ink-3 font-medium whitespace-nowrap block md:hidden">
                {item.bucket % 2 === 0 || item.bucket === 0 ? item.bucket : ''}
              </span>
            </div>
          ))}
        </div>

        {/* Click instruction hint */}
        <div className="absolute top-2 right-2 sm:top-4 sm:right-4 text-[9px] sm:text-[10px] font-medium text-brand bg-brand-muted px-2 sm:px-2.5 py-0.5 sm:py-1 rounded-full border border-brand/20 whitespace-nowrap pointer-events-none">
          <span className="hidden sm:inline">點擊長條查看標的</span>
          <span className="sm:hidden">點擊查看</span>
        </div>

        {selectedBucket && selectedBucket.count > 0 && (
          <div
            className={`absolute z-[60] top-1/2 -translate-y-1/2 w-[90%] sm:w-[300px] max-h-[85%] card shadow-card-lg flex flex-col
              left-1/2 -translate-x-1/2 sm:translate-x-0
              ${selectedBucket.bucket < 0 ? 'sm:left-auto sm:right-4' : 'sm:left-12'}
            `}
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-line">
              <h3 className="text-sm font-semibold text-ink-1 flex items-center gap-2">
                <span className={`px-2 py-0.5 rounded text-xs font-bold nums ${
                  selectedBucket.bucket > 0
                    ? 'bg-bull-muted text-bull'
                    : selectedBucket.bucket < 0
                    ? 'bg-bear-muted text-bear'
                    : 'bg-overlay text-ink-2'
                }`}>
                  {selectedBucket.bucket > 0 ? `+${selectedBucket.bucket}%` : `${selectedBucket.bucket}%`}
                </span>
                區間熱門標的
              </h3>
              <div className="flex items-center gap-2">
                <span className="text-xs text-ink-3">{selectedBucket.count} 家</span>
                <button onClick={handleClose} className="p-1 rounded-md text-ink-3 hover:text-ink-1 hover:bg-overlay transition-colors">
                  <X size={14} />
                </button>
              </div>
            </div>
            <div className="p-2.5 flex-1 overflow-y-auto">
              <div className="flex flex-col gap-1.5">
                {selectedBucket.top_stocks?.map((stock) => {
                  const isUp = stock.change_pct > 0;
                  return (
                    <div
                      key={stock.id}
                      onClick={() => handleStockClick(stock.id)}
                      className="flex justify-between items-center p-2.5 rounded-lg bg-overlay hover:bg-brand-muted hover:border-brand/30 border border-transparent cursor-pointer transition-all duration-150"
                    >
                      <div>
                        <span className="text-ink-1 font-semibold text-sm">{stock.name}</span>
                        <span className="text-ink-3 text-xs ml-1.5 font-mono">{stock.id}</span>
                      </div>
                      <div className="text-right">
                        <div className={`text-sm font-bold nums ${isUp ? 'text-bull' : 'text-bear'}`}>
                          {isUp ? '+' : ''}{stock.change_pct.toFixed(2)}%
                        </div>
                        <div className="text-ink-2 text-xs font-mono nums">{stock.price.toFixed(2)}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
              {(!selectedBucket.top_stocks || selectedBucket.top_stocks.length === 0) && (
                <div className="text-center py-6 text-ink-3 text-sm">此區間無熱門標的資料</div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default MarketDistribution;
