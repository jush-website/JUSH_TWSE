import React, { useState, useEffect } from 'react';
import api from '../services/api';
import { BarChart2, AlertCircle } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

const MarketDistribution = () => {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeBucket, setActiveBucket] = useState(null);
  const navigate = useNavigate();

  useEffect(() => {
    const fetchData = async () => {
      try {
        const res = await api.get('/api/market-distribution');
        setData(res.data);
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

  const handleStockClick = (stockId) => {
    navigate(`/analysis?q=${stockId}`);
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

  // Calculate max count to scale bars
  const maxCount = Math.max(...data.map(d => d.count), 1);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-white flex items-center gap-3">
            <BarChart2 className="w-8 h-8 text-blue-500" />
            大盤漲跌分佈圖
          </h1>
          <p className="text-gray-400 mt-2">全市場上市櫃個股今日漲跌幅家數分佈與熱門標的</p>
        </div>
      </div>

      <div className="bg-gray-800 rounded-3xl p-6 border border-gray-700 shadow-xl relative min-h-[500px]">
        {/* Y Axis Grid Lines */}
        <div className="absolute inset-0 p-6 pointer-events-none flex flex-col justify-between pt-10 pb-16 z-0">
          {[4, 3, 2, 1, 0].map((line, i) => (
            <div key={i} className="flex w-full items-center">
              <span className="w-10 text-right text-xs text-gray-500 pr-2">
                {Math.round(maxCount * (line / 4))}
              </span>
              <div className="flex-1 border-t border-gray-700/50"></div>
            </div>
          ))}
        </div>

        {/* Bars Container */}
        <div className="relative z-10 flex items-end justify-between h-[400px] mt-4 ml-10 mb-8 gap-1 sm:gap-2">
          {data.map((item) => {
            const isPositive = item.bucket > 0;
            const isZero = item.bucket === 0;
            const heightPercent = (item.count / maxCount) * 100;
            
            let barColor = 'bg-gray-600';
            if (isPositive) barColor = 'bg-red-500 hover:bg-red-400';
            else if (!isZero) barColor = 'bg-green-500 hover:bg-green-400';

            return (
              <div 
                key={item.bucket}
                className="relative flex flex-col items-center justify-end flex-1 group h-full cursor-pointer"
                onMouseEnter={() => setActiveBucket(item)}
                onMouseLeave={() => setActiveBucket(null)}
              >
                {/* Bar */}
                <div 
                  className={`w-full rounded-t-sm transition-all duration-300 ${barColor}`}
                  style={{ height: `${heightPercent}%`, minHeight: item.count > 0 ? '4px' : '0px' }}
                ></div>
                
                {/* Count Tooltip (Top) */}
                <div className="absolute -top-6 opacity-0 group-hover:opacity-100 transition-opacity text-xs font-bold text-white bg-gray-900 px-2 py-1 rounded">
                  {item.count} 家
                </div>

                {/* X Axis Label */}
                <div className="absolute -bottom-6 text-xs sm:text-sm text-gray-400 font-medium">
                  {item.bucket > 0 ? `+${item.bucket}` : item.bucket}%
                </div>
              </div>
            );
          })}
        </div>

        {/* Floating Hot Stocks Modal */}
        {activeBucket && activeBucket.count > 0 && (
          <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 z-50 bg-[#1e2329] border border-gray-700 rounded-xl shadow-2xl w-full max-w-2xl overflow-hidden pointer-events-auto">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-700/50 bg-[#2b3139]">
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                漲跌級距 {activeBucket.bucket > 0 ? `+${activeBucket.bucket}` : activeBucket.bucket}%
              </h3>
              <span className="text-sm text-gray-400 font-medium">熱門標的 ({activeBucket.count} 家)</span>
            </div>
            
            <div className="p-4 bg-[#1e2329]">
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                {activeBucket.top_stocks.map((stock) => {
                  const isUp = stock.change_pct > 0;
                  const isDown = stock.change_pct < 0;
                  const colorClass = isUp ? 'text-red-500' : (isDown ? 'text-green-500' : 'text-gray-300');
                  
                  return (
                    <div 
                      key={stock.id}
                      onClick={() => handleStockClick(stock.id)}
                      className="flex flex-col p-3 rounded-lg bg-[#2b3139] hover:bg-blue-600/20 hover:border-blue-500 border border-transparent cursor-pointer transition-colors"
                    >
                      <div className="flex justify-between items-center mb-1">
                        <span className="text-white font-bold text-sm truncate pr-2">{stock.name}</span>
                        <span className={`text-sm font-semibold ${colorClass}`}>
                          {stock.change_pct > 0 ? '+' : ''}{stock.change_pct.toFixed(2)}%
                        </span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-gray-400 text-xs">{stock.id}</span>
                        <span className="text-gray-300 text-sm">{stock.price.toFixed(2)}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
              {activeBucket.top_stocks.length === 0 && (
                <div className="text-center py-4 text-gray-500">此區間無熱門標的</div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default MarketDistribution;
