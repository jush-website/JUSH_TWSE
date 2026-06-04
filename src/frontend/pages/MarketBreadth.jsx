import React, { useState, useEffect } from 'react';
import { getMarketBreadth } from '../services/api';
import { Activity, AlertCircle, RefreshCw } from 'lucide-react';
import ProgressLoader from '../components/ProgressLoader';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, LabelList
} from 'recharts';

const MarketBreadth = () => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [lastUpdated, setLastUpdated] = useState(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        const res = await getMarketBreadth();
        setData(res.data);
        setLastUpdated(res.updated_at);
      } catch (err) {
        setError(err.message || '無法取得多空分佈資料');
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  if (loading) return (
    <div className="flex flex-col items-center justify-center py-20 space-y-4">
      <ProgressLoader progress={60} status="載入大盤多空分佈..." />
    </div>
  );
  
  if (error) return (
    <div className="text-center py-20 text-red-400">
      <AlertCircle className="w-12 h-12 mx-auto mb-3 opacity-50" />
      <p>{error}</p>
    </div>
  );

  if (!data || !data.histogram) return null;

  const { histogram, summary } = data;
  const { up, down, limit_up, limit_down, unchanged } = summary;
  const total = up + down + unchanged;
  
  const upPct = total ? (up / total) * 100 : 0;
  const downPct = total ? (down / total) * 100 : 0;
  const unchangedPct = total ? (unchanged / total) * 100 : 0;

  // Render customized label on top of bars
  const renderCustomBarLabel = (props) => {
    const { x, y, width, value } = props;
    if (value === 0) return null;
    return (
      <text x={x + width / 2} y={y - 10} fill="#e5e7eb" textAnchor="middle" dy={-6} fontSize={12} fontWeight="bold">
        {value}
      </text>
    );
  };

  return (
    <div className="space-y-6 animate-fade-in pb-20">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <div className="flex items-center space-x-3 mb-2">
            <div className="p-2 bg-purple-500/20 rounded-lg">
              <Activity className="text-purple-400 w-6 h-6" />
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-purple-400 to-pink-400">
              大盤漲跌分佈圖
            </h1>
          </div>
          <p className="text-gray-400 text-sm">
            全市場股票漲跌幅級距分佈，一眼看穿當日真實的多空力道與廣度。
          </p>
        </div>
        {lastUpdated && (
          <div className="flex items-center text-xs text-gray-400 bg-gray-800/50 px-3 py-1.5 rounded-full border border-gray-700/50 w-fit">
            <RefreshCw size={12} className="mr-1.5" />
            資料時間：{lastUpdated}
          </div>
        )}
      </div>

      <div className="bg-gray-800/60 rounded-3xl border border-gray-700/50 p-4 sm:p-8 shadow-xl">
        <h2 className="text-xl font-bold text-gray-200 mb-8 text-center hidden sm:block">
          市場漲跌家數分佈圖
        </h2>
        
        {/* Main Bar Chart */}
        <div className="h-[300px] sm:h-[400px] w-full mt-4">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={histogram}
              margin={{ top: 20, right: 0, left: -20, bottom: 20 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#374151" vertical={false} />
              <XAxis 
                dataKey="range" 
                tick={{ fill: '#9ca3af', fontSize: 12 }} 
                axisLine={{ stroke: '#4b5563' }}
                tickLine={false}
              />
              <YAxis hide={true} />
              <Tooltip 
                cursor={{ fill: 'rgba(255, 255, 255, 0.1)' }}
                content={({ active, payload }) => {
                  if (active && payload && payload.length) {
                    const data = payload[0].payload;
                    const range = data.range;
                    let labelStr = "";
                    if (range === 10) labelStr = "漲停 (>= 9.5%)";
                    else if (range === -10) labelStr = "跌停 (<= -9.5%)";
                    else if (range === 0) labelStr = "平盤 (0%)";
                    else if (range > 0) labelStr = `上漲 ${range-1}% ~ ${range}%`;
                    else labelStr = `下跌 ${range}% ~ ${range+1}%`;
                    
                    return (
                      <div className="bg-gray-900 border border-gray-700 p-3 rounded-lg shadow-xl">
                        <p className="text-gray-300 text-sm mb-1">{labelStr}</p>
                        <p className="text-white font-bold text-lg">{data.count} 家</p>
                      </div>
                    );
                  }
                  return null;
                }}
              />
              <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                <LabelList content={renderCustomBarLabel} />
                {histogram.map((entry, index) => {
                  let color = '#9ca3af'; // gray-400
                  if (entry.range > 0) color = '#f87171'; // red-400
                  else if (entry.range < 0) color = '#4ade80'; // green-400
                  return <Cell key={`cell-${index}`} fill={color} />;
                })}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Horizontal Stacked Bar */}
        <div className="mt-8 mb-6">
          <div className="flex h-6 sm:h-8 rounded-lg overflow-hidden shadow-inner">
            <div 
              style={{ width: `${downPct}%` }} 
              className="bg-green-500 flex items-center justify-center text-xs font-bold text-green-900 transition-all duration-1000"
            >
              {downPct > 5 && `${downPct.toFixed(1)}%`}
            </div>
            <div 
              style={{ width: `${unchangedPct}%` }} 
              className="bg-gray-500 flex items-center justify-center text-xs font-bold text-gray-900 transition-all duration-1000"
            >
              {unchangedPct > 5 && `${unchangedPct.toFixed(1)}%`}
            </div>
            <div 
              style={{ width: `${upPct}%` }} 
              className="bg-red-500 flex items-center justify-center text-xs font-bold text-red-900 transition-all duration-1000"
            >
              {upPct > 5 && `${upPct.toFixed(1)}%`}
            </div>
          </div>
        </div>

        {/* Statistics Text */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mt-6 pt-6 border-t border-gray-700/50">
          <div className="text-center">
            <div className="text-gray-400 text-sm mb-1">跌停家數</div>
            <div className="text-2xl font-bold text-green-400">{limit_down} <span className="text-xs text-green-500/70 font-normal">家</span></div>
          </div>
          <div className="text-center">
            <div className="text-gray-400 text-sm mb-1">下跌家數</div>
            <div className="text-2xl font-bold text-green-400">{down} <span className="text-xs text-green-500/70 font-normal">家</span></div>
          </div>
          <div className="text-center col-span-2 md:col-span-1 border-x-0 md:border-x border-gray-700/50">
            <div className="text-gray-400 text-sm mb-1">平盤家數</div>
            <div className="text-2xl font-bold text-gray-300">{unchanged} <span className="text-xs text-gray-500 font-normal">家</span></div>
          </div>
          <div className="text-center">
            <div className="text-gray-400 text-sm mb-1">上漲家數</div>
            <div className="text-2xl font-bold text-red-400">{up} <span className="text-xs text-red-500/70 font-normal">家</span></div>
          </div>
          <div className="text-center">
            <div className="text-gray-400 text-sm mb-1">漲停家數</div>
            <div className="text-2xl font-bold text-red-400">{limit_up} <span className="text-xs text-red-500/70 font-normal">家</span></div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default MarketBreadth;
