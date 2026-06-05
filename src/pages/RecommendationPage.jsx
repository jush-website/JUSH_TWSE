import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { 
  getShortTermRecommendations, 
  getOvernightRecommendations, 
  getBottomFishingRecommendations,
  getShortTermBurstRecommendations,
  getLongTermRecommendations,
  getEtfRecommendations,
  getCdpRecommendations,
  getDayTradeCdpRecommendations
} from '../services/api';
import StockCard from '../components/StockCard';
import ProgressLoader from '../components/ProgressLoader';
import { RefreshCw, LayoutGrid, List } from 'lucide-react';

const RecommendationPage = () => {
  const { type } = useParams();
  const [stocks, setStocks] = useState([]);
  const [loading, setLoading] = useState(true);

  const titles = {
    'short-term': '短線極佳推薦 (動能與量能指標)',
    'overnight': '隔日沖動能偵測 (主力分點與尾盤拉抬)',
    'bottom': '抄底絕佳標的 (乖離過大與超跌反彈)',
    'burst': '強勢爆發推薦 (放量突破與趨勢確認)',
    'long-term': '長期精選核心 (績優龍頭與穩定配息)',
    'etf': 'ETF 佈局 (穩健進場與防禦配置)',
    'cdp': 'CDP 逆勢分析 (當沖與隔日點位實戰)',
    'day-trade-cdp': '當沖 CDP 偵測 (實戰區間操作)'
  };

  const [sortBy, setSortBy] = useState('score');
  const [sortOrder, setSortOrder] = useState('desc');

  const fetchData = async () => {
    setLoading(true);
    try {
      let res;
      switch (type) {
        case 'short-term': res = await getShortTermRecommendations(); break;
        case 'overnight': res = await getOvernightRecommendations(); break;
        case 'bottom': res = await getBottomFishingRecommendations(); break;
        case 'burst': res = await getShortTermBurstRecommendations(); break;
        case 'long-term': res = await getLongTermRecommendations(); break;
        case 'etf': res = await getEtfRecommendations(); break;
        case 'cdp': res = await getCdpRecommendations(); break;
        case 'day-trade-cdp': res = await getDayTradeCdpRecommendations(); break;
        default: res = { data: [] };
      }
      setStocks(res.data || []);
    } catch (err) {
      console.error('Fetch recommendations failed', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [type]);

  const getScore = (stock) => {
    if (type === 'overnight') return stock.overnight?.score || 0;
    if (type === 'bottom') return stock.bottom_fishing_rec?.score || 0;
    if (type === 'burst') return stock.short_term_burst_rec?.score || 0;
    if (type === 'short-term') return stock.short_term_rec?.score || 0;
    if (type === 'day-trade-cdp') return stock.day_trade_cdp_rec?.score || 0;
    return stock.total_score || 0;
  };

  const sortedStocks = [...stocks].sort((a, b) => {
    let valA = sortBy === 'price' ? a.price : getScore(a);
    let valB = sortBy === 'price' ? b.price : getScore(b);
    return sortOrder === 'desc' ? valB - valA : valA - valB;
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">{titles[type] || '股票推薦'}</h1>
          <p className="text-gray-400 text-sm mt-1">
            系統每3分鐘自動更新指標，由雲端資料庫直接提供。
          </p>
        </div>
        
        {/* 排序控制區 */}
        {!loading && stocks.length > 0 && (
          <div className="flex items-center space-x-2 bg-gray-800 p-1.5 rounded-lg border border-gray-700">
            <select 
              value={sortBy} 
              onChange={(e) => setSortBy(e.target.value)}
              className="bg-gray-900 text-sm text-gray-200 border border-gray-600 rounded px-2 py-1 focus:outline-none focus:border-cyan-500"
            >
              <option value="score">依分數</option>
              <option value="price">依股價</option>
            </select>
            <select 
              value={sortOrder} 
              onChange={(e) => setSortOrder(e.target.value)}
              className="bg-gray-900 text-sm text-gray-200 border border-gray-600 rounded px-2 py-1 focus:outline-none focus:border-cyan-500"
            >
              <option value="desc">由高到低</option>
              <option value="asc">由低到高</option>
            </select>
          </div>
        )}
      </div>

      {loading ? (
        <ProgressLoader text="正在從資料庫同步最新推薦策略..." />
      ) : sortedStocks.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {sortedStocks.map((stock, index) => (
            <StockCard key={stock.stock_id || index} stock={stock} type={type} />
          ))}
        </div>
      ) : (
        <div className="bg-gray-800 rounded-xl p-20 text-center border border-dashed border-gray-700">
          <p className="text-gray-500">目前暫無符合該篩選條件的標的。</p>
        </div>
      )}
    </div>
  );
};

export default RecommendationPage;
