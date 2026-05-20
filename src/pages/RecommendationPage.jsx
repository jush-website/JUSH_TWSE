import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { 
  getShortTermRecommendations, 
  getOvernightRecommendations, 
  getBottomFishingRecommendations,
  getShortTermBurstRecommendations,
  getLongTermRecommendations,
  syncData
} from '../services/api';
import StockCard from '../components/StockCard';
import { RefreshCw, LayoutGrid, List } from 'lucide-react';

const RecommendationPage = () => {
  const { type } = useParams();
  const [stocks, setStocks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);

  const titles = {
    'short-term': '短線極佳推薦 (動能與量能指標)',
    'overnight': '隔日沖動能偵測 (主力分點與尾盤拉抬)',
    'bottom': '抄底絕佳標的 (乖離過大與超跌反彈)',
    'burst': '強勢爆發推薦 (放量突破與趨勢確認)',
    'long-term': '長期精選核心 (績優龍頭與穩定配息)'
  };

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
        default: res = { data: [] };
      }
      setStocks(res.data);
    } catch (err) {
      console.error('Fetch recommendations failed', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [type]);

  const handleSync = async () => {
    setSyncing(true);
    try {
      await syncData();
      await fetchData();
    } catch (err) {
      alert('同步失敗');
    } finally {
      setSyncing(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">{titles[type] || '股票推薦'}</h1>
          <p className="text-gray-400 text-sm mt-1">
            系統根據專業演算法篩選，每日自動更新核心指標。
          </p>
        </div>
        <button 
          onClick={handleSync}
          disabled={syncing}
          className="flex items-center justify-center space-x-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 px-4 py-2 rounded-lg font-medium transition"
        >
          <RefreshCw size={18} className={syncing ? 'animate-spin' : ''} />
          <span>{syncing ? '同步中...' : '同步數據'}</span>
        </button>
      </div>

      {loading ? (
        <div className="text-center py-20">
          <RefreshCw size={40} className="animate-spin mx-auto text-gray-600 mb-4" />
          <p className="text-gray-400">正在計算分析中，請稍候...</p>
        </div>
      ) : stocks.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {stocks.map(stock => (
            <StockCard key={stock.stock_id} stock={stock} type={type} />
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
