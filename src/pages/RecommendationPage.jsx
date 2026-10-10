import { useState, useEffect, useRef } from 'react';
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
  getLiveRecommendations,
  getQuotes
} from '../services/api';
import { RefreshCw, AlertTriangle } from 'lucide-react';
import StockCard from '../components/StockCard';
import ProgressLoader from '../components/ProgressLoader';
import { useCardAnimation } from '../hooks/useCardAnimation';
import BlurText from '../components/bits/BlurText';
import { usePolling } from '../hooks/usePolling';
import { isStaleBaseDate } from '../utils/freshness';
import NotFound from './NotFound';

// 台股盤中時段（週一至週五 09:00–13:30）；與元件狀態無關，放模組層級即可。
const isMarketHours = () => {
  const now = new Date();
  const day = now.getDay();
  const t = now.getHours() * 60 + now.getMinutes();
  return day >= 1 && day <= 5 && t >= 9 * 60 && t <= 13 * 60 + 30;
};

const TITLES = {
  'short-term': '短線極佳推薦 (動能與量能指標)',
  'overnight': '隔日沖動能偵測 (主力分點與尾盤拉抬)',
  'bottom': '抄底絕佳標的 (乖離過大與超跌反彈)',
  'burst': '強勢爆發推薦 (放量突破與趨勢確認)',
  'long-term': '長期精選核心 (績優龍頭與穩定配息)',
  'etf': 'ETF 佈局 (穩健進場與防禦配置)',
  'cdp': 'CDP 逆勢分析 (當沖與隔日點位實戰)',
  'day-trade-cdp': '當沖 CDP 偵測 (實戰區間操作)'
};

const RecommendationPage = () => {
  const { type } = useParams();
  const [stocks, setStocks] = useState([]);
  const [loading, setLoading] = useState(true);


  const [sortBy, setSortBy] = useState('score');
  const [sortOrder, setSortOrder] = useState('desc');

  const [updatedAt, setUpdatedAt] = useState(null);
  // 偵測到 Firestore 資料過期時記下原本的基準日；liveStatus 標示背景即時運算的進度
  const [staleNotice, setStaleNotice] = useState(null);
  const [liveStatus, setLiveStatus] = useState(null); // null | 'pending' | 'failed'
  const idsRef = useRef([]);
  // 每次抓取遞增；切換策略類型後，前一個類型還在路上的即時運算結果直接作廢
  const fetchSeq = useRef(0);

  const fetchData = async () => {
    const seq = ++fetchSeq.current;
    setLoading(true);
    setStaleNotice(null);
    setLiveStatus(null);
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
      if (seq !== fetchSeq.current) return;
      const baseStocks = res.data || [];
      // Firestore 沒資料，或資料的基準日已經落後太多（後端排程中斷時會發生：
      // 文件還在、但停留在好幾天前），都要向 Render 要即時運算補上。
      const stale = baseStocks.length > 0 && isStaleBaseDate(res.base_date);
      if (baseStocks.length > 0) {
        // 手上的資料先顯示出來（過期就標明日期），即時運算在背景跑。原本是等
        // Render 回應才顯示，Render 冷啟動時整頁要轉圈 1~2 分鐘，最後常常
        // 還是只能顯示同一份舊資料。
        setStocks(baseStocks);
        setUpdatedAt(res.updated_at || null);
        setLoading(false);
        overlayQuotes(baseStocks);
        if (!stale) return;
        setStaleNotice(res.base_date);
      }
      if (type in TITLES) {
        setLiveStatus('pending');
        const live = await getLiveRecommendations(type).catch(() => null);
        if (seq !== fetchSeq.current) return;
        if (live?.data?.length) {
          setStocks(live.data);
          setUpdatedAt(live.updated_at);
          setStaleNotice(null);
          setLiveStatus(null);
          overlayQuotes(live.data);
        } else {
          setLiveStatus('failed');
          if (baseStocks.length === 0) { setStocks([]); setUpdatedAt(null); }
        }
      } else if (baseStocks.length === 0) {
        setStocks([]);
        setUpdatedAt(null);
      }
    } catch (err) {
      console.error('Fetch recommendations failed', err);
    } finally {
      if (seq === fetchSeq.current) setLoading(false);
    }
  };

  // 手動更新：直接跟 Render 要即時運算的清單（不等 Firestore 同步），
  // 失敗時退回重抓 Firestore。冷快取時後端要現算，可能等 1~2 分鐘。
  const [refreshing, setRefreshing] = useState(false);
  const handleRefresh = async () => {
    if (refreshing) return;
    setRefreshing(true);
    try {
      const live = await getLiveRecommendations(type);
      if (live?.data?.length) {
        setStocks(live.data);
        setUpdatedAt(live.updated_at);
        overlayQuotes(live.data);
      } else {
        await fetchData();
      }
    } catch {
      await fetchData();
    } finally {
      setRefreshing(false);
    }
  };

  // 把即時報價套到卡片上：只覆蓋 price / change_percent，策略分數與訊號不動
  const applyQuotes = (quotes) => {
    if (!quotes || Object.keys(quotes).length === 0) return;
    setStocks(prev => prev.map(s => {
      const q = quotes[s.stock_id];
      if (!q || q.price == null) return s;
      return { ...s, price: q.price, change_percent: q.change_pct };
    }));
  };

  const overlayQuotes = async (baseStocks) => {
    const ids = baseStocks.map(s => s.stock_id).filter(Boolean);
    idsRef.current = ids;
    if (ids.length === 0) return;
    applyQuotes(await getQuotes(ids));
  };

  // 換策略類型就重新查詢；fetchData 會同步設 loading，避免畫面殘留上一個類型的清單。
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 這是抓取流程的起點，同步標記 loading 是刻意的
    fetchData();
  }, [type]);

  // 盤中每 15 秒刷新即時報價（配合後端報價快取 10s）。
  // usePolling 會在分頁隱藏時停掉：原本這支計時器不論分頁在不在前景都照打，
  // 一個開著沒看的分頁一小時就是 240 次報價請求。
  const refreshQuotes = async () => {
    if (!isMarketHours() || idsRef.current.length === 0) return;
    applyQuotes(await getQuotes(idsRef.current));
  };

  usePolling(refreshQuotes, 15 * 1000, { immediate: false });

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

  if (!(type in TITLES)) return <NotFound />;

  return (
    <div ref={containerRef} className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <BlurText as="h1" text={TITLES[type] || '股票推薦'} className="text-xl font-bold text-ink-1" />
          <p className="text-ink-3 text-sm mt-0.5">
            選股策略每日盤後更新{updatedAt ? `（資料基準：${updatedAt}）` : ''}；盤中價格每分鐘即時刷新
          </p>
          {/* 資料過期時標明日期，避免使用者把舊資料當成當日結果 */}
          {staleNotice && (
            <p className="text-bear text-xs mt-1.5 flex items-center gap-1">
              <AlertTriangle size={12} className="shrink-0" />
              以下為 {staleNotice} 的舊資料；
              {liveStatus === 'pending'
                ? '正在向伺服器要求即時運算（伺服器休眠時約需 1 分鐘）…'
                : '即時運算暫時無法取得，請稍後再試或按「手動更新」。'}
            </p>
          )}
        </div>
        
        <div className="flex items-center gap-2">
          {!loading && (
            <button
              onClick={handleRefresh}
              disabled={refreshing}
              title="不等每日同步，直接向伺服器要求即時運算最新清單"
              className="flex items-center gap-1.5 bg-panel border border-line text-ink-2 hover:text-ink-1 hover:bg-overlay text-sm px-3 py-1.5 rounded-lg transition disabled:opacity-60"
            >
              <RefreshCw size={13} className={refreshing ? 'animate-spin' : ''} />
              {refreshing ? '更新中...' : '手動更新'}
            </button>
          )}

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
