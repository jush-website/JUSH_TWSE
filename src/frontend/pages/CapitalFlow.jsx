import React, { useState, useEffect } from 'react';
import { getCapitalFlow } from '../services/api';
import { Link } from 'react-router-dom';
import { ArrowRight, BarChart3, TrendingUp, Layers, AlertCircle, RefreshCw, Flame } from 'lucide-react';
import ProgressLoader from '../components/ProgressLoader';

const CapitalFlow = () => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedIndustry, setSelectedIndustry] = useState(null);
  const [lastUpdated, setLastUpdated] = useState(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        const res = await getCapitalFlow();
        setData(res.data || []);
        setLastUpdated(res.updated_at);
        if (res.data && res.data.length > 0) {
          setSelectedIndustry(res.data[0]); // Default select the top industry
        }
      } catch (err) {
        setError(err.message || '無法取得資金流向資料');
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

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
        <AlertCircle className="w-16 h-16 text-gray-500 mx-auto mb-4" />
        <h2 className="text-2xl font-bold text-gray-300">目前尚無資金流向資料</h2>
        <p className="text-gray-400 mt-2">請稍後再試，或確認後端排程是否已執行</p>
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
    return 'bg-gray-700 border-gray-600';
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

  return (
    <div className="space-y-6 animate-fade-in pb-20">
      {/* Header Section */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <div className="flex items-center space-x-3 mb-2">
            <div className="p-2 bg-blue-500/20 rounded-lg">
              <Layers className="text-blue-400 w-6 h-6" />
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-purple-400">
              資金流向板塊 (Heatmap)
            </h1>
          </div>
          <p className="text-gray-400 text-sm">
            掌握台股熱錢動向，尋找資金匯聚的核心主流產業。色塊大小代表成交比重，顏色深淺代表平均漲跌幅。
          </p>
        </div>
        
        {lastUpdated && (
          <div className="flex items-center text-xs text-gray-400 bg-gray-800/50 px-3 py-1.5 rounded-full border border-gray-700/50 w-fit">
            <RefreshCw size={12} className="mr-1.5" />
            資料時間：{lastUpdated}
          </div>
        )}
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        {/* Heatmap Section */}
        <div className="lg:col-span-2 space-y-4">
          <div className="bg-gray-800/40 rounded-2xl border border-gray-700/50 p-4 sm:p-5">
            <h2 className="text-lg font-bold text-white mb-4 flex items-center">
              <Flame className="w-5 h-5 text-orange-400 mr-2" />
              產業熱力圖
            </h2>
            <div className="grid grid-cols-3 md:grid-cols-6 gap-2 auto-rows-min">
              {data.map((ind, idx) => (
                <div
                  key={idx}
                  onClick={() => setSelectedIndustry(ind)}
                  className={`
                    cursor-pointer rounded-xl border p-3 flex flex-col justify-between transition-all duration-300 hover:scale-[1.02] hover:shadow-lg hover:shadow-blue-500/20 hover:z-10 relative overflow-hidden
                    ${getBlockColor(ind.avg_change_pct)}
                    ${getBlockSize(ind.value_ratio)}
                    ${selectedIndustry?.industry === ind.industry ? 'ring-2 ring-white shadow-[0_0_15px_rgba(255,255,255,0.3)]' : ''}
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
            
            {/* Legend */}
            <div className="mt-4 flex flex-wrap items-center justify-center gap-2 text-xs text-gray-400">
              <span>跌</span>
              <div className="w-4 h-4 bg-green-600 rounded"></div>
              <div className="w-4 h-4 bg-green-500/80 rounded"></div>
              <div className="w-4 h-4 bg-green-400/50 rounded"></div>
              <div className="w-4 h-4 bg-gray-700 rounded mx-1"></div>
              <div className="w-4 h-4 bg-red-400/50 rounded"></div>
              <div className="w-4 h-4 bg-red-500/80 rounded"></div>
              <div className="w-4 h-4 bg-red-600 rounded"></div>
              <span>漲</span>
            </div>
          </div>
        </div>

        {/* Selected Industry Detail Section */}
        <div className="lg:col-span-1 space-y-4">
          <div className="bg-gray-800/40 rounded-2xl border border-gray-700/50 p-4 sm:p-5 sticky top-20">
            {selectedIndustry ? (
              <>
                <div className="flex justify-between items-start mb-4 pb-4 border-b border-gray-700/50">
                  <div>
                    <h2 className="text-xl font-bold text-white">{selectedIndustry.industry}</h2>
                    <p className="text-sm text-gray-400 mt-1">
                      市場資金佔比 {selectedIndustry.value_ratio}%
                    </p>
                  </div>
                  <div className={`text-xl font-bold ${selectedIndustry.avg_change_pct >= 0 ? 'text-red-400' : 'text-green-400'}`}>
                    {selectedIndustry.avg_change_pct > 0 ? '+' : ''}{selectedIndustry.avg_change_pct}%
                  </div>
                </div>

                <div className="mb-4">
                  <h3 className="text-sm font-medium text-gray-400 mb-3 flex items-center">
                    <TrendingUp className="w-4 h-4 mr-1.5" />
                    板塊代表標的 (依成交值)
                  </h3>
                  <div className="space-y-3">
                    {selectedIndustry.top_stocks?.map((stock, idx) => (
                      <Link 
                        to={`/analyze/${stock.id}`} 
                        key={idx}
                        className="group flex items-center justify-between p-3 rounded-xl bg-gray-900/50 border border-gray-700/50 hover:bg-gray-700/50 hover:border-gray-600 transition-colors"
                      >
                        <div>
                          <div className="font-bold text-gray-200 group-hover:text-blue-400 transition-colors flex items-center">
                            {stock.name} 
                            <span className="text-xs text-gray-500 ml-2">{stock.id}</span>
                          </div>
                          <div className="text-xs text-gray-400 mt-1">
                            成交值: {formatMoney(stock.value)}
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="text-sm font-medium text-gray-300">
                            ${stock.price}
                          </div>
                          <div className={`text-xs font-bold mt-1 ${stock.change_pct >= 0 ? 'text-red-400' : 'text-green-400'}`}>
                            {stock.change_pct > 0 ? '+' : ''}{stock.change_pct}%
                          </div>
                        </div>
                      </Link>
                    ))}
                    {(!selectedIndustry.top_stocks || selectedIndustry.top_stocks.length === 0) && (
                      <div className="text-center py-6 text-gray-500 text-sm">
                        無代表標的資料
                      </div>
                    )}
                  </div>
                </div>
                
                <div className="p-3 bg-blue-900/20 border border-blue-800/30 rounded-lg">
                  <p className="text-xs text-blue-200 leading-relaxed">
                    <strong>分析提示：</strong> 若某產業的「資金佔比」連續幾日放大，且「平均漲幅」維持正值，代表法人與熱錢正積極流入該板塊，是短波段操作的首選目標。反之若資金佔比極高但漲勢停滯，需留意高檔出貨風險。
                  </p>
                </div>
              </>
            ) : (
              <div className="text-center py-10 text-gray-500">
                點擊左側熱力圖查看產業細節
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default CapitalFlow;
