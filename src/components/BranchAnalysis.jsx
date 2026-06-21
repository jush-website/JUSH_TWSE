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
      <div className="card p-12 flex flex-col items-center justify-center min-h-[300px]">
        <div className="animate-spin rounded-full h-8 w-8 border-2 border-brand border-t-transparent mb-4"></div>
        <p className="text-ink-3 text-sm">正在獲取最新分點籌碼數據...</p>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="card p-12 flex flex-col items-center justify-center min-h-[300px]">
        <AlertCircle className="w-10 h-10 text-ink-3 mb-3" />
        <p className="text-ink-2 font-semibold">無法載入分點籌碼資料</p>
        <p className="text-ink-3 text-sm mt-1">{error || '今日可能尚未有交易或資料尚未更新'}</p>
      </div>
    );
  }

  const { buy_branches, sell_branches } = data;

  return (
    <div className="space-y-5">
      <div className="card p-4 sm:p-5">
        <div className="flex items-center gap-2 mb-4">
          <Users size={15} className="text-ink-3" />
          <h2 className="font-semibold text-ink-1">分點主力進出排行榜（張）</h2>
        </div>

        <div className="grid lg:grid-cols-2 gap-4">
          {/* Buy Branches */}
          <div className="overflow-hidden rounded-xl border border-line">
            <div className="bg-bull-muted border-b border-bull/20 p-2.5 flex items-center gap-2">
              <TrendingUp size={14} className="text-bull" />
              <h3 className="text-bull text-sm font-semibold">買方主力 Top 15</h3>
            </div>
            <div className="overflow-x-auto">
              <table style={{ minWidth: 360 }} className="w-full text-sm text-left">
                <thead className="bg-overlay">
                  <tr>
                    <th className="px-3 py-2 text-ink-3 text-xs font-medium">券商分點</th>
                    <th className="px-3 py-2 text-ink-3 text-xs font-medium text-right">買超張數</th>
                    <th className="px-3 py-2 text-ink-3 text-xs font-medium text-right">均價</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {buy_branches.length === 0 ? (
                    <tr><td colSpan="3" className="text-center py-4 text-ink-3 text-sm">無資料</td></tr>
                  ) : (
                    buy_branches.map((branch, idx) => (
                      <tr key={idx} className="hover:bg-overlay transition-colors">
                        <td className="px-3 py-2.5 text-ink-1 text-sm">{branch.name}</td>
                        <td className="px-3 py-2.5 text-right text-bull font-semibold text-sm nums">+{branch.net_buy.toLocaleString()}</td>
                        <td className="px-3 py-2.5 text-right text-ink-3 text-sm nums">{branch.price.toFixed(2)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Sell Branches */}
          <div className="overflow-hidden rounded-xl border border-line">
            <div className="bg-bear-muted border-b border-bear/20 p-2.5 flex items-center gap-2">
              <TrendingDown size={14} className="text-bear" />
              <h3 className="text-bear text-sm font-semibold">賣方主力 Top 15</h3>
            </div>
            <div className="overflow-x-auto">
              <table style={{ minWidth: 360 }} className="w-full text-sm text-left">
                <thead className="bg-overlay">
                  <tr>
                    <th className="px-3 py-2 text-ink-3 text-xs font-medium">券商分點</th>
                    <th className="px-3 py-2 text-ink-3 text-xs font-medium text-right">賣超張數</th>
                    <th className="px-3 py-2 text-ink-3 text-xs font-medium text-right">均價</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {sell_branches.length === 0 ? (
                    <tr><td colSpan="3" className="text-center py-4 text-ink-3 text-sm">無資料</td></tr>
                  ) : (
                    sell_branches.map((branch, idx) => (
                      <tr key={idx} className="hover:bg-overlay transition-colors">
                        <td className="px-3 py-2.5 text-ink-1 text-sm">{branch.name}</td>
                        <td className="px-3 py-2.5 text-right text-bear font-semibold text-sm nums">{branch.net_buy.toLocaleString()}</td>
                        <td className="px-3 py-2.5 text-right text-ink-3 text-sm nums">{branch.price.toFixed(2)}</td>
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
