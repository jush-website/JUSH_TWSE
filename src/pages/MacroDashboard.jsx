import React, { useState, useEffect } from 'react';
import { Activity, Globe, DollarSign, TrendingUp } from 'lucide-react';
import ProgressLoader from '../components/ProgressLoader';
import api from '../services/api';

const MacroDashboard = () => {
  const [data, setData] = useState({
    exchangeRates: [],
    usTreasury: [],
    gold: [],
    oil: []
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchMacroData = async () => {
      try {
        // Fetch Exchange Rate (USD/TWD)
        const usdRes = await api.get('/api/finmind/ExchangeRate?date=2024-01-01');
        
        // You can fetch more here
        
        setData({
          exchangeRates: usdRes.data?.data || [],
          usTreasury: [],
          gold: [],
          oil: []
        });
      } catch (err) {
        console.error('Failed to fetch macro data', err);
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

      <div className="grid lg:grid-cols-2 gap-6">
        <div className="bg-gray-800/80 backdrop-blur-xl rounded-2xl border border-gray-700/50 p-6 shadow-xl">
          <div className="flex items-center space-x-2 mb-4 text-green-400">
            <DollarSign className="w-6 h-6" />
            <h2 className="text-lg font-bold text-gray-200">外匯市場 (匯率)</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-gray-300">
              <thead className="bg-gray-900 text-gray-400">
                <tr>
                  <th className="p-3 rounded-tl-xl">日期</th>
                  <th className="p-3">幣別</th>
                  <th className="p-3 rounded-tr-xl">匯率 (對台幣)</th>
                </tr>
              </thead>
              <tbody>
                {data.exchangeRates.slice(-10).map((item, idx) => (
                  <tr key={idx} className="border-b border-gray-700/50 hover:bg-gray-750">
                    <td className="p-3">{item.date}</td>
                    <td className="p-3">{item.currency || 'USD'}</td>
                    <td className="p-3">{item.cash_sell}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="bg-gray-800/80 backdrop-blur-xl rounded-2xl border border-gray-700/50 p-6 shadow-xl flex items-center justify-center">
            <p className="text-gray-500">更多總經指標陸續整合中...</p>
        </div>
      </div>
    </div>
  );
};

export default MacroDashboard;
