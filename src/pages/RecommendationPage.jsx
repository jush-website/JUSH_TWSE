import React, { useState, useEffect, useRef } from 'react';
import { useParams } from 'react-router-dom';
import {
  getShortTermRecommendations,
  getOvernightRecommendations,
  getBottomFishingRecommendations,
  getShortTermBurstRecommendations,
  getLongTermRecommendations,
  getEtfRecommendations,
  getCdpRecommendations,
  getDayTradeCdpRecommendations,
  getQuotes
} from '../services/api';
import StockCard from '../components/StockCard';
import ProgressLoader from '../components/ProgressLoader';
import { useCardAnimation } from '../hooks/useCardAnimation';
import BlurText from '../components/bits/BlurText';

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

  const [updatedAt, setUpdatedAt] = useState(null);
  const idsRef = useRef([]);

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
      const baseStocks = res.data || [];
      setStocks(baseStocks);
      setUpdatedAt(res.updated_at || null);
      // 盤中以即時報價覆蓋過時收盤價
      overlayQuotes(baseStocks);
    } catch (err) {
      console.error('Fetch recommendations failed', err);
    } finally {
      setLoading(false);
    }
  };

  // 用即時報價覆蓋卡片上的 price / change_percent，不動策略分數與訊號
  const overlayQuotes = async (baseStocks) => {
    const ids = baseStocks.map(s => s.stock_id).filter(Boolean);
    idsRef.current = ids;
    if (ids.length === 0) return;
    const quotes = await getQuotes(ids);
    if (!quotes || Object.keys(quotes).length === 0) return;
    setStocks(prev => prev.map(s => {
      const q = quotes[s.stock_id];
      if (!q || q.price == null) return s;
      return { ...s, price: q.price, change_percent: q.change_pct };
    }));
  };

  useEffect(() => {
    fetchData();
  }, [type]);

  // 盤中每 60 秒刷新即時報價 (僅覆蓋價格，不重抓策略)
  useEffect(() => {
    const isMarketHours = () => {
      const now = new Date();
      const day = now.getDay();
      const t = now.getHours() * 60 + now.getMinutes();
      return day >= 1 && day <= 5 && t >= 9 * 60 && t <= 13 * 60 + 30;
    };
    const timer = setInterval(() => {
      if (isMarketHours() && idsRef.current.length > 0) {
        getQuotes(idsRef.current).then(quotes => {
          if (!quotes || Object.keys(quotes).length === 0) return;
          setStocks(prev => prev.map(s => {
            const q = quotes[s.stock_id];
            if (!q || q.price == null) return s;
            return { ...s, price: q.price, change_percent: q.change_pct };
          }));
        });
      }
    }, 60 * 1000);
    return () => clearInterval(timer);
  }, []);

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

  // deps 只看 loading/type：盤中每分鐘的即時報價 setStocks 不應重播入場動畫
  const containerRef = useCardAnimation('.gsap-recommend-card', [loading, type], {
    enabled: !loading && stocks.length > 0,
    stagger: 0.08,
    duration: 0.35,
  });

  return (
    <div ref={containerRef} className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <BlurText as="h1" text={titles[type] || '股票推薦'} className="text-xl font-bold text-ink-1" />
          <p className="text-ink-3 text-sm mt-0.5">
            選股策略每日盤後更新{updatedAt ? `（資料基準：${updatedAt}）` : ''}；盤中價格每分鐘即時刷新
          </p>
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
          <p className="text-ink-3 text-sm mt-1">選股策略於每日盤後更新，稍後請重新整理</p>
        </div>
      )}
    </div>
  );
};

export default RecommendationPage;
