import React from 'react';
import { useNavigate } from 'react-router-dom';
import { TrendingUp, TrendingDown, Info, ShieldAlert } from 'lucide-react';

const StockCard = ({ stock, type }) => {
  const navigate = useNavigate();
  
  // 決定主分數與狀態
  let score = stock.total_score || 0;
  let status = stock.recommend_status || 'N/A';
  let subText = '';

  if (type === 'overnight') {
    score = stock.overnight?.score || 0;
    status = stock.overnight?.status || 'N/A';
    subText = `隔日沖佔比: ${stock.overnight?.broker_ratio}%`;
  } else if (type === 'bottom') {
    score = stock.bottom_fishing_rec?.score || 0;
    status = stock.bottom_fishing_rec?.status || 'N/A';
  } else if (type === 'burst') {
    score = stock.short_term_burst_rec?.score || 0;
    status = stock.short_term_burst_rec?.status || 'N/A';
  } else if (type === 'short-term') {
    score = stock.short_term_rec?.score || 0;
    status = stock.short_term_rec?.status || 'N/A';
  } else if (type === 'cdp') {
    // CDP 不以評分為主，顯示關注重點
    score = stock.total_score || 0;
    status = stock.cdp?.is_preview ? '明日預覽' : '今日即時';
  }

  const cdp = stock.cdp;
  const showCdp = cdp && cdp.CDP;

  const isPositive = stock.change_percent >= 0;

  return (
    <div 
      onClick={() => navigate(`/analyze/${stock.stock_id}`)}
      className="bg-gray-800 rounded-xl border border-gray-700 p-4 hover:border-blue-500 transition cursor-pointer group"
    >
      <div className="flex justify-between items-start mb-3">
        <div>
          <h3 className="font-bold text-lg text-white group-hover:text-blue-400">{stock.stock_name}</h3>
          <span className="text-gray-400 text-sm">{stock.stock_id}</span>
        </div>
        <div className={`px-2 py-1 rounded text-xs font-bold ${
          score >= 70 ? 'bg-red-900 text-red-200' : 
          score >= 50 ? 'bg-orange-900 text-orange-200' : 'bg-gray-700 text-gray-300'
        }`}>
          {score} 分
        </div>
      </div>

      <div className="flex items-end justify-between mb-4">
        <div>
          <div className="text-2xl font-bold">{stock.price}</div>
          <div className={`flex items-center text-sm font-medium ${isPositive ? 'text-red-400' : 'text-green-400'}`}>
            {isPositive ? <TrendingUp size={14} className="mr-1" /> : <TrendingDown size={14} className="mr-1" />}
            {isPositive ? '+' : ''}{stock.change_percent}%
          </div>
        </div>
        <div className="text-right">
          <div className="text-xs text-gray-500">狀態</div>
          <div className="text-sm font-semibold text-blue-300">{status}</div>
        </div>
      </div>

      <div className="space-y-2 pt-3 border-t border-gray-700">
        {!showCdp && (
          <div className="flex justify-between text-xs">
            <span className="text-gray-400">成交量比</span>
            <span className={stock.vol_ratio > 1.5 ? 'text-orange-400 font-bold' : 'text-gray-200'}>
              {stock.vol_ratio}
            </span>
          </div>
        )}
        {subText && !showCdp && (
          <div className="flex justify-between text-xs">
            <span className="text-gray-400">關鍵數據</span>
            <span className="text-blue-300 font-medium">{subText}</span>
          </div>
        )}
        {!showCdp && (
          <div className="flex justify-between text-xs">
            <span className="text-gray-400">策略建議</span>
            <span className="text-gray-200 truncate ml-2">{stock.strategy_name}</span>
          </div>
        )}
        
        {/* CDP 專屬數據展示 */}
        {showCdp && (
          <div className="mt-2 space-y-1.5 bg-gray-900/50 p-2 rounded-lg border border-gray-700/50">
            <div className="flex justify-between text-xs items-center">
              <span className="text-red-400 font-medium w-8">AH</span>
              <span className="text-gray-200">{cdp.AH}</span>
              <span className="text-blue-400 font-medium w-8 ml-4">NL</span>
              <span className="text-gray-200">{cdp.NL}</span>
            </div>
            <div className="flex justify-between text-xs items-center">
              <span className="text-red-300 font-medium w-8">NH</span>
              <span className="text-gray-200">{cdp.NH}</span>
              <span className="text-blue-500 font-medium w-8 ml-4">AL</span>
              <span className="text-gray-200">{cdp.AL}</span>
            </div>
            <div className="flex justify-center text-xs items-center pt-1 border-t border-gray-700/50 mt-1">
              <span className="text-purple-400 font-bold mr-2">CDP</span>
              <span className="text-white font-bold">{cdp.CDP}</span>
            </div>
          </div>
        )}
      </div>

      <div className="mt-3 flex items-center text-[10px] text-gray-500 italic">
        <Info size={12} className="mr-1" />
        點擊查看詳細分析診斷
      </div>
    </div>
  );
};

export default StockCard;
