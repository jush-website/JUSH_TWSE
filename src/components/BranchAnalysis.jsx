import React, { useState, useEffect } from 'react';
import { Users, AlertCircle, TrendingUp, TrendingDown } from 'lucide-react';
import api from '../services/api';

const BranchAnalysis = ({ stockId, stockName }) => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchBranchData = async () => {
      if (!stockId) return;
      setLoading(true);
      setError(null);
      try {
        const res = await api.get(`/api/stock/${stockId}/branch-data`);
        setData(res.data.data);
      } catch (err) {
        console.error("Fetch branch data error:", err);
        setError(err.response?.data?.detail || err.message || '無法取得籌碼分點資料');
      } finally {
        setLoading(false);
      }
    };
    fetchBranchData();
  }, [stockId]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center p-12 bg-gray-800 rounded-2xl border border-gray-700 shadow-xl min-h-[400px]">
        <div className="animate-spin rounded-full h-10 w-10 border-4 border-blue-500 border-t-transparent mb-4"></div>
        <p className="text-gray-400">正在獲取最新分點籌碼數據...</p>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex flex-col items-center justify-center p-12 bg-gray-800 rounded-2xl border border-gray-700 shadow-xl min-h-[400px]">
        <AlertCircle className="w-12 h-12 text-gray-500 mb-4" />
        <p className="text-gray-400 text-lg font-bold">無法載入分點籌碼資料</p>
        <p className="text-gray-500 text-sm mt-2">{error || '今日可能尚未有交易或資料尚未更新'}</p>
      </div>
    );
  }

  const { buy_branches, sell_branches } = data;

  return (
    <div className="space-y-6">
      <div className="bg-gray-800/80 backdrop-blur-xl rounded-2xl border border-gray-700/50 p-6 shadow-2xl">
        <div className="flex items-center space-x-2 mb-6 text-gray-300">
          <Users size={24} className="text-blue-400" />
          <h2 className="text-xl font-bold">分點主力進出排行榜 (張)</h2>
        </div>
        
        <div className="grid lg:grid-cols-2 gap-8">
          {/* Buy Branches */}
          <div className="bg-gray-900/50 rounded-xl border border-gray-700 overflow-hidden">
            <div className="bg-red-900/20 border-b border-red-900/50 p-3 flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <TrendingUp className="text-red-400 w-5 h-5" />
                <h3 className="text-red-400 font-bold">買方主力 (Top 15)</h3>
              </div>
            </div>
            <div className="overflow-x-auto pb-2 custom-scrollbar">
              <table className="w-full min-w-[500px] text-sm text-left text-gray-300">
                <thead className="text-xs text-gray-500 bg-gray-800/50 uppercase border-b border-gray-700">
                  <tr>
                    <th className="px-4 py-3">券商分點</th>
                    <th className="px-4 py-3 text-right">買超張數</th>
                    <th className="px-4 py-3 text-right">買均價</th>
                  </tr>
                </thead>
                <tbody>
                  {buy_branches.length === 0 ? (
                    <tr><td colSpan="3" className="text-center py-4 text-gray-500">無資料</td></tr>
                  ) : (
                    buy_branches.map((branch, idx) => (
                      <tr key={idx} className="border-b border-gray-800 hover:bg-gray-800/50 transition-colors">
                        <td className="px-4 py-3 font-medium text-gray-200">{branch.name}</td>
                        <td className="px-4 py-3 text-right text-red-400 font-bold">+{branch.net_buy.toLocaleString()}</td>
                        <td className="px-4 py-3 text-right text-gray-400">{branch.price.toFixed(2)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Sell Branches */}
          <div className="bg-gray-900/50 rounded-xl border border-gray-700 overflow-hidden">
            <div className="bg-green-900/20 border-b border-green-900/50 p-3 flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <TrendingDown className="text-green-400 w-5 h-5" />
                <h3 className="text-green-400 font-bold">賣方主力 (Top 15)</h3>
              </div>
            </div>
            <div className="overflow-x-auto pb-2 custom-scrollbar">
              <table className="w-full min-w-[500px] text-sm text-left text-gray-300">
                <thead className="text-xs text-gray-500 bg-gray-800/50 uppercase border-b border-gray-700">
                  <tr>
                    <th className="px-4 py-3">券商分點</th>
                    <th className="px-4 py-3 text-right">賣超張數</th>
                    <th className="px-4 py-3 text-right">賣均價</th>
                  </tr>
                </thead>
                <tbody>
                  {sell_branches.length === 0 ? (
                    <tr><td colSpan="3" className="text-center py-4 text-gray-500">無資料</td></tr>
                  ) : (
                    sell_branches.map((branch, idx) => (
                      <tr key={idx} className="border-b border-gray-800 hover:bg-gray-800/50 transition-colors">
                        <td className="px-4 py-3 font-medium text-gray-200">{branch.name}</td>
                        <td className="px-4 py-3 text-right text-green-400 font-bold">{branch.net_buy.toLocaleString()}</td>
                        <td className="px-4 py-3 text-right text-gray-400">{branch.price.toFixed(2)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default BranchAnalysis;
