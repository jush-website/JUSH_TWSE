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
    <div ref={containerRef} className="space-y-5 pb-12">
      <div className="flex items-center gap-2 mb-2">
        <Target size={18} className="text-ink-3" />
        <h1 className="text-xl font-bold text-ink-1">期權籌碼</h1>
      </div>

      {error && (
        <div className="bg-bull-muted border border-bull/30 text-bull p-4 rounded-xl text-sm">
          {error} - FinMind 免費版可能有速率限制，請稍後再試
        </div>
      )}

      {latest && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="gsap-derivative-card card p-4">
            <div className="text-xs text-ink-3 mb-1">最新收盤</div>
            <div className="text-xl font-bold text-ink-1 nums">{latest.close?.toLocaleString()}</div>
            <div className={`text-sm font-semibold mt-1 nums ${isUp ? 'text-bull' : 'text-bear'}`}>
              {isUp ? '▲' : '▼'} {Math.abs(priceChange)} ({priceChangePct}%)
            </div>
            <div className="text-[10px] text-ink-3 mt-1">{latest.date}</div>
          </div>
          <div className="gsap-derivative-card card p-4">
            <div className="text-xs text-ink-3 mb-1">成交量</div>
            <div className="text-xl font-bold text-brand nums">{latest.volume?.toLocaleString()}</div>
            <div className="text-[10px] text-ink-3 mt-1">口</div>
          </div>
          <div className="gsap-derivative-card card p-4">
            <div className="text-xs text-ink-3 mb-1">未平倉口數</div>
            <div className="text-xl font-bold text-ink-1 nums">{latest.open_interest?.toLocaleString()}</div>
            <div className="text-[10px] text-ink-3 mt-1">口</div>
          </div>
          <div className="gsap-derivative-card card p-4">
            <div className="text-xs text-ink-3 mb-1">今日高 / 低</div>
            <div className="text-base font-bold text-bull nums">{latest.max?.toLocaleString()}</div>
            <div className="text-base font-bold text-bear nums">{latest.min?.toLocaleString()}</div>
          </div>
        </div>
      )}

      <div className="gsap-derivative-card card p-5">
        <div className="flex items-center gap-2 mb-4">
          <Activity size={16} className="text-ink-3" />
          <h2 className="font-semibold text-ink-1">台指期 (TX) 近月合約日成交（近 30 日）</h2>
        </div>
        {data.futures.length === 0 ? (
          <div className="text-center py-8">
            <p className="text-sm text-ink-3">目前無期貨資料</p>
            <p className="text-xs mt-1 text-ink-3">FinMind TaiwanFuturesDaily — data_id: TX</p>
          </div>
        ) : (
          <div className="overflow-x-auto custom-scrollbar -mx-1">
            <table className="w-full text-left text-sm min-w-[640px]">
              <thead className="bg-overlay">
                <tr>
                  {['日期','開盤','最高','最低','收盤','成交量','未平倉'].map(h => (
                    <th key={h} className="p-2.5 text-ink-3 text-xs font-medium">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {data.futures.map((item, idx) => {
                  const dayUp = item.close >= item.open;
                  return (
                    <tr key={idx} className="hover:bg-overlay transition-colors">
                      <td className="p-2.5 font-mono text-xs text-ink-3">{item.date}</td>
                      <td className="p-2.5 text-ink-2 text-xs nums">{item.open?.toLocaleString()}</td>
                      <td className="p-2.5 text-bull text-xs nums">{item.max?.toLocaleString()}</td>
                      <td className="p-2.5 text-bear text-xs nums">{item.min?.toLocaleString()}</td>
                      <td className={`p-2.5 font-semibold text-xs nums ${dayUp ? 'text-bull' : 'text-bear'}`}>
                        {item.close?.toLocaleString()}
                      </td>
                      <td className="p-2.5 text-brand text-xs nums">{item.volume?.toLocaleString()}</td>
                      <td className="p-2.5 text-ink-2 text-xs nums">{item.open_interest?.toLocaleString()}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="gsap-derivative-card card p-4 text-xs text-ink-3">
        資料來源：FinMind 免費版 TaiwanFuturesDaily。顯示台指期主力近月合約（每日成交量最大之到期月別）。
      </div>
    </div>
  );
};

export default Derivatives;
