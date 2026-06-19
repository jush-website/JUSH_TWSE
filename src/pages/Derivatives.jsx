import React, { useState, useEffect } from 'react';
import { Activity, Target, TrendingUp } from 'lucide-react';
import ProgressLoader from '../components/ProgressLoader';
import api from '../services/api';

const Derivatives = () => {
  const [data, setData] = useState({
    futures: [],
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const futuresRes = await api.get('/api/finmind/TaiwanFuturesDaily?data_id=TX&date=2024-01-01');
        
        setData({
          futures: futuresRes.data?.data || [],
        });
      } catch (err) {
        console.error('Failed to fetch derivatives data', err);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  if (loading) return <ProgressLoader text="正在載入期權籌碼數據..." />;

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12">
      <div className="flex items-center space-x-3 mb-6">
        <Target className="text-purple-400 w-8 h-8" />
        <h1 className="text-2xl sm:text-3xl font-black text-white">期權籌碼與即時報價</h1>
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        <div className="bg-gray-800/80 backdrop-blur-xl rounded-2xl border border-gray-700/50 p-6 shadow-xl">
          <div className="flex items-center space-x-2 mb-4 text-purple-400">
            <Activity className="w-6 h-6" />
            <h2 className="text-lg font-bold text-gray-200">台指期貨日成交資訊</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-gray-300">
              <thead className="bg-gray-900 text-gray-400">
                <tr>
                  <th className="p-3 rounded-tl-xl">日期</th>
                  <th className="p-3">契約</th>
                  <th className="p-3">收盤價</th>
                  <th className="p-3">成交量</th>
                  <th className="p-3 rounded-tr-xl">未平倉</th>
                </tr>
              </thead>
              <tbody>
                {data.futures.slice(-10).map((item, idx) => (
                  <tr key={idx} className="border-b border-gray-700/50 hover:bg-gray-750">
                    <td className="p-3">{item.date}</td>
                    <td className="p-3">{item.contract_date}</td>
                    <td className="p-3">{item.close}</td>
                    <td className="p-3">{item.trading_volume}</td>
                    <td className="p-3">{item.open_interest}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="bg-gray-800/80 backdrop-blur-xl rounded-2xl border border-gray-700/50 p-6 shadow-xl flex items-center justify-center">
            <p className="text-gray-500">更多期權籌碼指標陸續整合中...</p>
        </div>
      </div>
    </div>
  );
};

export default Derivatives;
