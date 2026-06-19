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
        <div className="flex flex-col items-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mb-4"></div>
          <p className="text-gray-400">載入大盤分佈資料中...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="bg-red-900/50 p-6 rounded-2xl flex flex-col items-center max-w-md text-center">
          <AlertCircle className="w-12 h-12 text-red-500 mb-4" />
          <h2 className="text-xl font-bold text-red-100 mb-2">資料載入失敗</h2>
          <p className="text-red-200">{error}</p>
        </div>
      </div>
    );
  }

  const maxCount = Math.max(...data.map(d => d.count), 1);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-white flex items-center gap-3">
            <BarChart2 className="w-8 h-8 text-blue-500" />
            大盤漲跌分佈圖
          </h1>
          <p className="text-gray-400 mt-2">全市場上市櫃個股今日漲跌幅家數分佈｜點擊長條查看熱門標的</p>
        </div>
      </div>

      <div className="bg-gray-800/80 backdrop-blur-xl rounded-3xl p-4 sm:p-6 lg:p-8 border border-gray-700 shadow-2xl relative">
        <div className="relative h-[350px] sm:h-[450px] w-full mt-2 flex">
          {/* Y-axis labels */}
          <div className="w-10 sm:w-12 flex flex-col justify-between py-4 text-[10px] sm:text-xs text-gray-500 pr-2 sm:pr-3 text-right border-r border-gray-700/50">
            {[4, 3, 2, 1, 0].map((line) => (
              <span key={line}>{Math.round(maxCount * (line / 4))}</span>
            ))}
          </div>

          {/* Bars Area */}
          <div className="flex-1 relative pl-2 sm:pl-3">
            {/* Y Grid Lines */}
            <div className="absolute inset-0 pl-2 sm:pl-3 pointer-events-none flex flex-col justify-between py-4">
              {[4, 3, 2, 1, 0].map((line) => (
                <div key={line} className="w-full border-t border-gray-700/30"></div>
              ))}
            </div>

            {/* Bars */}
            <div className="absolute inset-0 pl-2 sm:pl-3 py-4 flex items-end justify-between gap-[2px] sm:gap-1.5 z-10">
              {data.map((item) => {
                const isPositive = item.bucket > 0;
                const isZero = item.bucket === 0;
                const heightPercent = (item.count / maxCount) * 100;

                // Premium Gradient Colors
                let barClass = 'bg-gradient-to-t from-gray-700/80 to-gray-500 border-t border-gray-400 hover:from-gray-600 hover:to-gray-400';
                if (isPositive) {
                  barClass = 'bg-gradient-to-t from-red-900/80 to-red-500 border-t border-red-400 hover:from-red-700 hover:to-red-400 shadow-[0_0_15px_rgba(239,68,68,0.2)]';
                } else if (!isZero) {
                  barClass = 'bg-gradient-to-t from-green-900/80 to-green-500 border-t border-green-400 hover:from-green-700 hover:to-green-400 shadow-[0_0_15px_rgba(34,197,94,0.2)]';
                }

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
                      className={`w-full rounded-t-sm transition-all duration-500 ease-out ${barClass} ${isSelected ? 'ring-2 ring-white ring-opacity-80 z-20 shadow-[0_0_20px_rgba(255,255,255,0.3)]' : ''}`}
                      style={{
                        height: `${Math.max(heightPercent, item.count === 0 ? 0.5 : 1)}%`,
                        opacity: item.count === 0 ? 0.2 : 1
                      }}
                    ></div>

                    {/* Tooltip */}
                    <div className="absolute -top-10 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity z-50 text-[10px] sm:text-xs font-bold text-white bg-gray-900/90 backdrop-blur-sm px-2 sm:px-3 py-1.5 rounded-lg whitespace-nowrap border border-gray-700 pointer-events-none shadow-xl flex items-center gap-1">
                      <span className={isPositive ? 'text-red-400' : isZero ? 'text-gray-300' : 'text-green-400'}>
                        {item.bucket > 0 ? `+${item.bucket}` : item.bucket}%
                      </span>
                      <span className="text-gray-500 px-0.5">|</span>
                      <span>{item.count} 家</span>
                      {isClickable && <span className="ml-1 text-[9px] text-blue-400">(點擊)</span>}
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
              <span className="text-[10px] sm:text-[11px] text-gray-400 font-medium whitespace-nowrap hidden md:block">
                {item.bucket > 0 ? `+${item.bucket}` : item.bucket}
              </span>
              {/* Show alternating or key labels on smaller screens to prevent overlap */}
              <span className="text-[9px] text-gray-400 font-medium whitespace-nowrap block md:hidden">
                {item.bucket % 2 === 0 || item.bucket === 0 ? item.bucket : ''}
              </span>
            </div>
          ))}
        </div>

        {/* Click instruction hint */}
        <div className="absolute top-4 right-6 text-[10px] sm:text-xs font-medium text-blue-400/80 bg-blue-900/20 px-3 py-1.5 rounded-full border border-blue-800/30">
          💡 點擊有數據的長條可查看該區間的熱門標的
        </div>
      </div>

      {/* Hot Stocks Modal - appears below the chart when clicked */}
      {selectedBucket && selectedBucket.count > 0 && (
        <div className="mt-6 bg-[#1e2329] border border-gray-700 rounded-2xl shadow-2xl overflow-hidden animate-fade-in">
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-700/50 bg-[#2b3139]">
            <h3 className="text-lg font-bold text-white flex items-center gap-3">
              <span className={`px-3 py-1 rounded-full text-sm ${selectedBucket.bucket > 0 ? 'bg-red-500/20 text-red-400 border border-red-500/50' : selectedBucket.bucket < 0 ? 'bg-green-500/20 text-green-400 border border-green-500/50' : 'bg-gray-700 text-gray-300 border border-gray-600'}`}>
                {selectedBucket.bucket > 0 ? `+${selectedBucket.bucket}%` : `${selectedBucket.bucket}%`}
              </span>
              區間熱門標的
            </h3>
            <div className="flex items-center gap-4">
              <span className="text-sm text-gray-400">{selectedBucket.count} 家</span>
              <button
                onClick={handleClose}
                className="p-1.5 rounded-lg hover:bg-gray-700 text-gray-400 hover:text-white transition-colors"
                aria-label="關閉"
              >
                <X size={18} />
              </button>
            </div>
          </div>
          
          <div className="p-4 bg-[#1e2329]">
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
              {selectedBucket.top_stocks?.map((stock) => {
                const isUp = stock.change_pct > 0;
                const isDown = stock.change_pct < 0;
                const colorClass = isUp ? 'text-red-500' : (isDown ? 'text-green-500' : 'text-gray-300');
                
                return (
                  <div 
                    key={stock.id}
                    onClick={() => handleStockClick(stock.id)}
                    className="flex flex-col p-3 rounded-xl bg-[#2b3139] hover:bg-blue-600/20 hover:border-blue-500 border border-transparent cursor-pointer transition-all duration-200 hover:scale-[1.02]"
                  >
                    <div className="flex justify-between items-center mb-1">
                      <span className="text-white font-bold text-sm truncate pr-2">{stock.name}</span>
                      <span className={`text-sm font-semibold ${colorClass}`}>
                        {stock.change_pct > 0 ? '+' : ''}{stock.change_pct.toFixed(2)}%
                      </span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-gray-400 text-xs">{stock.id}</span>
                      <span className="text-gray-300 text-sm font-mono">{stock.price.toFixed(2)}</span>
                    </div>
                  </div>
                );
              })}
            </div>
            {(!selectedBucket.top_stocks || selectedBucket.top_stocks.length === 0) && (
              <div className="text-center py-4 text-gray-500">此區間無熱門標的資料</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default MarketDistribution;
