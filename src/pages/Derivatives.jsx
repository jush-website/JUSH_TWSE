import React, { useState, useEffect } from 'react';
import { Activity, Target, TrendingUp, TrendingDown, BarChart2, ChevronDown, ChevronUp } from 'lucide-react';
import ProgressLoader from '../components/ProgressLoader';
import { useCardAnimation } from '../hooks/useCardAnimation';
import api from '../services/api';

const Derivatives = () => {
  const [data, setData] = useState({ futures: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const startDate = new Date();
        startDate.setMonth(startDate.getMonth() - 3);
        const startDateStr = startDate.toISOString().split('T')[0];

        // TaiwanFuturesDaily: data_id is the futures symbol (TX = 台指期大台)
        const futuresRes = await api.get(`/api/finmind/TaiwanFuturesDaily?data_id=TX&start_date=${startDateStr}`);
        const raw = futuresRes.data?.data || [];

        // Filter out after-market session (night session) to only show regular daily settlement
        const regularSessions = raw.filter(item => item.trading_session === 'position');

        // 只取近月主力合約（成交量最大）後反轉排序
        const grouped = {};
        regularSessions.forEach(item => {
          const key = item.date;
          if (!grouped[key] || (item.volume ?? 0) > (grouped[key].volume ?? 0)) {
            grouped[key] = item;
          }
        });
        const futures = Object.values(grouped).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 30);

        setData({ futures });
      } catch (err) {
        console.error('Failed to fetch derivatives data', err);
        setError('無法載入期貨數據');
      } finally {
        setLoading(false);
      }
    };
    fetchData();
    const interval = setInterval(fetchData, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);


  const containerRef = useCardAnimation('.gsap-derivative-card', [loading], {
    enabled: !loading, stagger: 0.15,
  });

  if (loading) return <ProgressLoader text="正在載入期權籌碼數據..." />;

  const latest = data.futures[0];
  const prev = data.futures[1];
  const priceChange = latest && prev ? (latest.close - prev.close).toFixed(0) : null;
  const priceChangePct = latest && prev ? (((latest.close - prev.close) / prev.close) * 100).toFixed(2) : null;
  const isUp = parseFloat(priceChangePct) >= 0;

  return (
    <div ref={containerRef} className="space-y-6 max-w-7xl mx-auto pb-12">
      <div className="flex items-center space-x-3 mb-6">
        <Target className="text-purple-400 w-8 h-8" />
        <h1 className="text-2xl sm:text-3xl font-black text-white">期權籌碼</h1>
      </div>

      {error && (
        <div className="bg-red-900/30 border border-red-800 text-red-200 p-4 rounded-xl text-sm">
          {error} - FinMind 免費版可能有速率限制，請稍後再試
        </div>
      )}

      {/* 最新期貨摘要卡 */}
      {latest && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="gsap-derivative-card bg-gray-800/80 rounded-2xl border border-gray-700/50 p-4 shadow-lg">
            <div className="text-xs text-gray-400 mb-1">最新收盤</div>
            <div className="text-2xl font-black text-white">{latest.close?.toLocaleString()}</div>
            <div className={`text-sm font-bold mt-1 ${isUp ? 'text-red-400' : 'text-green-400'}`}>
              {isUp ? '▲' : '▼'} {Math.abs(priceChange)} ({priceChangePct}%)
            </div>
            <div className="text-xs text-gray-500 mt-1">{latest.date}</div>
          </div>
          <div className="gsap-derivative-card bg-gray-800/80 rounded-2xl border border-gray-700/50 p-4 shadow-lg">
            <div className="text-xs text-gray-400 mb-1">成交量</div>
            <div className="text-xl font-black text-blue-300">{latest.volume?.toLocaleString()}</div>
            <div className="text-xs text-gray-500 mt-1">口</div>
          </div>
          <div className="gsap-derivative-card bg-gray-800/80 rounded-2xl border border-gray-700/50 p-4 shadow-lg">
            <div className="text-xs text-gray-400 mb-1">未平倉口數</div>
            <div className="text-xl font-black text-yellow-300">{latest.open_interest?.toLocaleString()}</div>
            <div className="text-xs text-gray-500 mt-1">口</div>
          </div>
          <div className="gsap-derivative-card bg-gray-800/80 rounded-2xl border border-gray-700/50 p-4 shadow-lg">
            <div className="text-xs text-gray-400 mb-1">今日最高/最低</div>
            <div className="text-lg font-bold text-red-300">{latest.max?.toLocaleString()}</div>
            <div className="text-lg font-bold text-green-300">{latest.min?.toLocaleString()}</div>
          </div>
        </div>
      )}

      {/* 台指期近月日成交明細 */}
      <div className="gsap-derivative-card bg-gray-800/80 backdrop-blur-xl rounded-2xl border border-gray-700/50 p-6 shadow-xl">
        <div className="flex items-center space-x-2 mb-4 text-purple-400">
          <Activity className="w-6 h-6" />
          <h2 className="text-lg font-bold text-gray-200">台指期 (TX) 近月合約日成交 (近 30 日)</h2>
        </div>
        {data.futures.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            <p className="text-sm">目前無期貨資料</p>
            <p className="text-xs mt-1 text-gray-600">FinMind TaiwanFuturesDaily 資料集 — data_id: TX</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-gray-300">
              <thead className="bg-gray-900 text-gray-400">
                <tr>
                  <th className="p-3 rounded-tl-xl">日期</th>
                  <th className="p-3">開盤</th>
                  <th className="p-3">最高</th>
                  <th className="p-3">最低</th>
                  <th className="p-3">收盤</th>
                  <th className="p-3">成交量</th>
                  <th className="p-3 rounded-tr-xl">未平倉</th>
                </tr>
              </thead>
              <tbody>
                {data.futures.map((item, idx) => {
                  const dayUp = item.close >= item.open;
                  return (
                    <tr key={idx} className="border-b border-gray-700/50 hover:bg-gray-700/30 transition-colors">
                      <td className="p-3 font-mono text-xs text-gray-400">{item.date}</td>
                      <td className="p-3">{item.open?.toLocaleString()}</td>
                      <td className="p-3 text-red-300">{item.max?.toLocaleString()}</td>
                      <td className="p-3 text-green-300">{item.min?.toLocaleString()}</td>
                      <td className={`p-3 font-bold ${dayUp ? 'text-red-400' : 'text-green-400'}`}>
                        {item.close?.toLocaleString()}
                      </td>
                      <td className="p-3 text-blue-300">{item.volume?.toLocaleString()}</td>
                      <td className="p-3 text-yellow-300">{item.open_interest?.toLocaleString()}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="gsap-derivative-card bg-gray-800/60 rounded-2xl border border-gray-700/40 p-4 text-xs text-gray-500">
        📊 資料來源：FinMind 免費版 TaiwanFuturesDaily。顯示台指期主力近月合約（每日成交量最大之到期月別）。
      </div>
    </div>
  );
};

export default Derivatives;
