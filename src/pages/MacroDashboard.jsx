import React, { useState, useEffect } from 'react';
import { Activity, Globe, DollarSign, TrendingUp, TrendingDown, BarChart2 } from 'lucide-react';
import ProgressLoader from '../components/ProgressLoader';
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
  }, []);

  if (loading) return <ProgressLoader text="正在載入總體經濟數據..." />;

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12">
      <div className="flex items-center space-x-3 mb-6">
        <Globe className="text-blue-400 w-8 h-8" />
        <h1 className="text-2xl sm:text-3xl font-black text-white">總體經濟儀表板</h1>
      </div>

      {error && (
        <div className="bg-red-900/30 border border-red-800 text-red-200 p-4 rounded-xl text-sm">
          {error} - 資料來源可能有速率限制，請稍後再試
        </div>
      )}

      <div className="grid lg:grid-cols-2 gap-6">
        {/* 匯率表 */}
        <div className="bg-gray-800/80 backdrop-blur-xl rounded-2xl border border-gray-700/50 p-6 shadow-xl">
          <div className="flex items-center space-x-2 mb-4 text-green-400">
            <DollarSign className="w-6 h-6" />
            <h2 className="text-lg font-bold text-gray-200">美元/台幣匯率 (近三個月)</h2>
          </div>
          {data.exchangeRates.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              <p className="text-sm">目前無匯率資料</p>
              <p className="text-xs mt-1 text-gray-600">請稍後再試或檢查網路</p>
            </div>
          ) : (
            <div className="overflow-x-auto max-h-80 overflow-y-auto custom-scrollbar">
              <table className="w-full text-left text-sm text-gray-300">
                <thead className="bg-gray-900/80 text-gray-400 sticky top-0 backdrop-blur-md">
                  <tr>
                    <th className="p-3 rounded-tl-xl font-medium">日期</th>
                    <th className="p-3 font-medium">即期買入</th>
                    <th className="p-3 font-medium">即期賣出</th>
                    <th className="p-3 rounded-tr-xl font-medium">現鈔賣出</th>
                  </tr>
                </thead>
                <tbody>
                  {data.exchangeRates.map((item, idx) => (
                    <tr key={idx} className="border-b border-gray-700/50 hover:bg-gray-700/30 transition-colors">
                      <td className="p-3 font-mono text-xs">{item.date}</td>
                      <td className="p-3 text-blue-300">{item.spot_buy ?? item.cash_buy ?? '-'}</td>
                      <td className="p-3 text-red-300">{item.spot_sell ?? '-'}</td>
                      <td className="p-3 text-gray-400">{item.cash_sell ?? '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* 美國公債殖利率 */}
        <div className="bg-gray-800/80 backdrop-blur-xl rounded-2xl border border-gray-700/50 p-6 shadow-xl">
          <div className="flex items-center space-x-2 mb-4 text-yellow-400">
            <BarChart2 className="w-6 h-6" />
            <h2 className="text-lg font-bold text-gray-200">美國公債殖利率 (10年期)</h2>
          </div>
          {data.usTreasury.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              <p className="text-sm">目前無公債數據</p>
              <p className="text-xs mt-1 text-gray-600">請稍後再試或檢查網路</p>
            </div>
          ) : (
            <div className="overflow-x-auto max-h-80 overflow-y-auto custom-scrollbar">
              <table className="w-full text-left text-sm text-gray-300">
                <thead className="bg-gray-900/80 text-gray-400 sticky top-0 backdrop-blur-md">
                  <tr>
                    <th className="p-3 rounded-tl-xl font-medium">日期</th>
                    <th className="p-3 font-medium">期別</th>
                    <th className="p-3 rounded-tr-xl font-medium">殖利率 (%)</th>
                  </tr>
                </thead>
                <tbody>
                  {data.usTreasury.map((item, idx) => (
                    <tr key={idx} className="border-b border-gray-700/50 hover:bg-gray-700/30 transition-colors">
                      <td className="p-3 font-mono text-xs">{item.date}</td>
                      <td className="p-3">{item.type ?? '-'}</td>
                      <td className="p-3 text-yellow-400 font-medium">{item.yield_rate ?? '-'}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      <div className="bg-gray-800/60 rounded-2xl border border-gray-700/40 p-4 text-xs text-gray-400 leading-relaxed">
        📊 <strong className="text-gray-300">資料來源說明：</strong><br />
        • 美元/台幣匯率由 FinMind 免費版提供 (TaiwanExchangeRate 資料集)，每日由台灣銀行更新一次。<br />
        • 美國 10 年期公債殖利率 (^TNX) 資料由 Yahoo Finance 提供，為全球股市重要參考總經指標。
      </div>
    </div>
  );
};

export default MacroDashboard;
