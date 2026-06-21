import React, { useState, useEffect } from 'react';
import { Activity, Globe, DollarSign, TrendingUp, TrendingDown, BarChart2 } from 'lucide-react';
import ProgressLoader from '../components/ProgressLoader';
import { useCardAnimation } from '../hooks/useCardAnimation';
import api from '../services/api';

const MacroDashboard = () => {
  const [data, setData] = useState({
    exchangeRates: [],
    usTreasury: [],
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchMacroData = async () => {
      try {
        // FinMind ExchangeRate: data_id is the currency code e.g. 'USD'
        const startDate = new Date();
        startDate.setMonth(startDate.getMonth() - 3);
        const startDateStr = startDate.toISOString().split('T')[0];

        const [usdRes, usTreasuryRes] = await Promise.allSettled([
          api.get(`/api/finmind/TaiwanExchangeRate?data_id=USD&start_date=${startDateStr}`),
          api.get(`/api/macro/us-treasury`),
        ]);

        const exchangeRates = usdRes.status === 'fulfilled'
          ? (usdRes.value.data?.data || []).slice(-30).reverse()
          : [];
        const usTreasury = usTreasuryRes.status === 'fulfilled'
          ? (usTreasuryRes.value.data?.data || []).slice(-30).reverse()
          : [];

        setData({ exchangeRates, usTreasury });
      } catch (err) {
        console.error('Failed to fetch macro data', err);
        setError('無法載入總體經濟數據');
      } finally {
        setLoading(false);
      }
    };
    fetchMacroData();
    const interval = setInterval(fetchMacroData, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);


  const containerRef = useCardAnimation('.gsap-macro-card', [loading], {
    enabled: !loading, stagger: 0.15,
  });

  if (loading) return <ProgressLoader text="正在載入總體經濟數據..." />;

  return (
    <div ref={containerRef} className="space-y-6 pb-12">
      <div className="flex items-center gap-2 mb-2">
        <Globe size={18} className="text-ink-3" />
        <h1 className="text-xl font-bold text-ink-1">總體經濟儀表板</h1>
      </div>

      {error && (
        <div className="bg-bull-muted border border-bull/30 text-bull p-4 rounded-xl text-sm">
          {error} - 資料來源可能有速率限制，請稍後再試
        </div>
      )}

      <div className="grid lg:grid-cols-2 gap-5">
        {/* 匯率表 */}
        <div className="gsap-macro-card card p-5">
          <div className="flex items-center gap-2 mb-4">
            <DollarSign size={16} className="text-ink-3" />
            <h2 className="font-semibold text-ink-1">美元 / 台幣匯率（近三個月）</h2>
          </div>
          {data.exchangeRates.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-sm text-ink-3">目前無匯率資料</p>
              <p className="text-xs mt-1 text-ink-3">請稍後再試或檢查網路</p>
            </div>
          ) : (
            <div className="overflow-x-auto max-h-72 overflow-y-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-overlay sticky top-0">
                  <tr>
                    <th className="p-2.5 text-ink-3 font-medium text-xs">日期</th>
                    <th className="p-2.5 text-ink-3 font-medium text-xs">即期買入</th>
                    <th className="p-2.5 text-ink-3 font-medium text-xs">即期賣出</th>
                    <th className="p-2.5 text-ink-3 font-medium text-xs">現鈔賣出</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {data.exchangeRates.map((item, idx) => (
                    <tr key={idx} className="hover:bg-overlay transition-colors">
                      <td className="p-2.5 font-mono text-xs text-ink-3">{item.date}</td>
                      <td className="p-2.5 text-brand text-xs nums">{item.spot_buy ?? item.cash_buy ?? '-'}</td>
                      <td className="p-2.5 text-bull text-xs nums">{item.spot_sell ?? '-'}</td>
                      <td className="p-2.5 text-ink-2 text-xs nums">{item.cash_sell ?? '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* 美國公債殖利率 */}
        <div className="gsap-macro-card card p-5">
          <div className="flex items-center gap-2 mb-4">
            <BarChart2 size={16} className="text-ink-3" />
            <h2 className="font-semibold text-ink-1">美國公債殖利率（10 年期）</h2>
          </div>
          {data.usTreasury.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-sm text-ink-3">目前無公債數據</p>
              <p className="text-xs mt-1 text-ink-3">請稍後再試或檢查網路</p>
            </div>
          ) : (
            <div className="overflow-x-auto max-h-72 overflow-y-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-overlay sticky top-0">
                  <tr>
                    <th className="p-2.5 text-ink-3 font-medium text-xs">日期</th>
                    <th className="p-2.5 text-ink-3 font-medium text-xs">期別</th>
                    <th className="p-2.5 text-ink-3 font-medium text-xs">殖利率 (%)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {data.usTreasury.map((item, idx) => (
                    <tr key={idx} className="hover:bg-overlay transition-colors">
                      <td className="p-2.5 font-mono text-xs text-ink-3">{item.date}</td>
                      <td className="p-2.5 text-ink-2 text-xs">{item.type ?? '-'}</td>
                      <td className="p-2.5 text-brand font-medium text-xs nums">{item.yield_rate ?? '-'}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      <div className="card p-4 text-xs text-ink-3 leading-relaxed">
        <strong className="text-ink-2">資料來源：</strong>
        美元/台幣匯率由 FinMind（TaiwanExchangeRate）提供，每日由台灣銀行更新；
        美 10 年期公債殖利率 (^TNX) 由 Yahoo Finance 提供。
      </div>
    </div>
  );
};

export default MacroDashboard;
