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
import { useCardAnimation } from '../hooks/useCardAnimation';
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

  const containerRef = useCardAnimation('.gsap-recommend-card', [loading, stocks], {
    enabled: !loading && stocks.length > 0,
    stagger: 0.08,
    duration: 0.35,
  });

  return (
    <div ref={containerRef} className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-ink-1">{titles[type] || '股票推薦'}</h1>
          <p className="text-ink-3 text-sm mt-0.5">系統每 3 分鐘自動更新，由雲端資料庫提供</p>
        </div>
        
        {!loading && stocks.length > 0 && (
          <div className="flex items-center gap-2 bg-panel border border-line p-1 rounded-lg">
            <select
              value={sortBy}
              onChange={e => setSortBy(e.target.value)}
              className="bg-overlay border border-line text-sm text-ink-1 rounded-md px-2 py-1 focus:outline-none focus:ring-2 focus:ring-brand/30"
            >
              <option value="score">依分數</option>
              <option value="price">依股價</option>
            </select>
            <select
              value={sortOrder}
              onChange={e => setSortOrder(e.target.value)}
              className="bg-overlay border border-line text-sm text-ink-1 rounded-md px-2 py-1 focus:outline-none focus:ring-2 focus:ring-brand/30"
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
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {sortedStocks.map((stock, index) => (
            <StockCard key={stock.stock_id || index} stock={stock} type={type} />
          ))}
        </div>
      ) : (
        <div className="card p-20 text-center border-dashed">
          <div className="text-4xl mb-4">📭</div>
          <p className="text-ink-2 font-medium">暫無符合條件的標的</p>
          <p className="text-ink-3 text-sm mt-1">系統每 3 分鐘自動更新，稍後請重新整理</p>
        </div>
      )}
    </div>
  );
};

export default RecommendationPage;
