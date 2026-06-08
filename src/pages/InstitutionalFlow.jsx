import React, { useState, useEffect } from 'react';
import { getInstitutionalFlow } from '../services/api';
import { ResponsiveContainer, ComposedChart, Area, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from 'recharts';
import ProgressLoader from '../components/ProgressLoader';
import { Building, TrendingUp, TrendingDown, Clock, ShieldAlert } from 'lucide-react';

const formatValue = (val) => {
  if (val === undefined || val === null) return '0';
  const v = Number(val);
  if (Math.abs(v) >= 100000000) return (v / 100000000).toFixed(2) + ' 億';
  if (Math.abs(v) >= 10000) return (v / 10000).toFixed(0) + ' 萬';
  return v.toString();
};

const CustomTooltip = ({ active, payload, label }) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-gray-900/80 backdrop-blur-xl border border-gray-700/50 p-4 rounded-xl shadow-2xl min-w-[200px]">
        <p className="text-gray-300 mb-3 border-b border-gray-700/50 pb-2 font-bold">{label}</p>
        <div className="space-y-2">
          {payload.map((entry, index) => {
            const isTotal = entry.dataKey === '合計';
            return (
              <div key={index} className={`flex justify-between items-center text-sm ${isTotal ? 'mt-3 pt-2 border-t border-gray-700/50 font-bold' : ''}`}>
                <span style={{ color: entry.color }}>{entry.name}</span>
                <span className={`font-mono ${Number(entry.value) > 0 ? 'text-red-400' : Number(entry.value) < 0 ? 'text-green-400' : 'text-gray-400'}`}>
                  {formatValue(entry.value)}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    );
  }
  return null;
};

const InstitutionalFlow = () => {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const res = await getInstitutionalFlow();
        setData(res.data || []);
      } catch (err) {
        setError('無法取得資料，請稍後再試。');
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  if (loading) return <ProgressLoader text="正在載入法人資金動向..." />;
  if (error) return <div className="text-center py-20 text-red-400 font-bold flex flex-col items-center"><ShieldAlert size={48} className="mb-4" />{error}</div>;
  if (data && data.error) return <div className="text-center py-20 text-red-400 font-bold flex flex-col items-center"><ShieldAlert size={48} className="mb-4" />FinMind API 錯誤或達到呼叫上限，請稍後再試。<br/><span className="text-sm mt-2 font-normal text-red-400/70">({data.error})</span></div>;
  if (!data || !Array.isArray(data) || data.length === 0) return <div className="text-center py-20 text-gray-400">目前沒有法人買賣超資料</div>;

  const latestData = data[data.length - 1];
  
  const StatCard = ({ title, value, colorClass }) => (
    <div className={`bg-gray-800/80 backdrop-blur-xl rounded-2xl border border-gray-700/50 p-4 sm:p-6 shadow-xl hover:border-gray-500/50 transition-all duration-300`}>
      <h3 className="text-gray-400 text-sm font-medium mb-2">{title}</h3>
      <div className={`text-2xl sm:text-3xl font-black tracking-tight ${colorClass}`}>
        {value > 0 ? '+' : ''}{formatValue(value)}
      </div>
    </div>
  );

  return (
    <div className="space-y-6 sm:space-y-8 animate-fade-in pb-10">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between border-b border-gray-800 pb-4">
        <div>
          <div className="flex items-center space-x-3 text-cyan-400 mb-2">
            <div className="p-2 bg-cyan-500/20 rounded-lg">
              <Building size={28} className="drop-shadow-[0_0_8px_rgba(34,211,238,0.8)]" />
            </div>
            <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-blue-500">
              三大法人買賣超
            </h1>
          </div>
          <p className="text-gray-400 text-sm">追蹤外資、投信、自營商的資金動向，掌握大盤籌碼方向</p>
        </div>
        <div className="mt-4 sm:mt-0 flex items-center space-x-2 text-xs text-gray-500 bg-gray-800/50 px-3 py-1.5 rounded-full border border-gray-700/50">
          <Clock size={12} />
          <span>最新資料：{latestData.date ? latestData.date.split(' ')[0] : ''}</span>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard 
          title="外資及陸資" 
          value={latestData['外資及陸資'] || 0} 
          colorClass={latestData['外資及陸資'] > 0 ? 'text-red-400' : 'text-green-400'} 
        />
        <StatCard 
          title="投信" 
          value={latestData['投信'] || 0} 
          colorClass={latestData['投信'] > 0 ? 'text-red-400' : 'text-green-400'} 
        />
        <StatCard 
          title="自營商" 
          value={latestData['自營商'] || 0} 
          colorClass={latestData['自營商'] > 0 ? 'text-red-400' : 'text-green-400'} 
        />
        <StatCard 
          title="三大法人合計" 
          value={latestData['合計'] || 0} 
          colorClass={latestData['合計'] > 0 ? 'text-red-500' : 'text-green-500'} 
        />
      </div>

      <div className="bg-gray-800/80 backdrop-blur-xl rounded-3xl border border-gray-700/50 p-4 sm:p-6 shadow-2xl relative overflow-hidden group">
        <div className="absolute inset-0 bg-gradient-to-br from-cyan-500/5 to-purple-500/5 opacity-0 group-hover:opacity-100 transition-opacity duration-700 pointer-events-none"></div>
        
        <h2 className="text-xl font-bold mb-6 text-gray-200 flex items-center">
          <TrendingUp size={20} className="mr-2 text-cyan-400" /> 近 30 日資金流向趨勢
        </h2>
        
        <div className="h-[400px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={data} margin={{ top: 10, right: 10, left: 20, bottom: 0 }}>
              <defs>
                <linearGradient id="colorTotal" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#A855F7" stopOpacity={0.3}/>
                  <stop offset="95%" stopColor="#A855F7" stopOpacity={0}/>
                </linearGradient>
                <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
                  <feGaussianBlur stdDeviation="2" result="blur" />
                  <feComposite in="SourceGraphic" in2="blur" operator="over" />
                </filter>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#374151" opacity={0.4} vertical={false} />
              <XAxis dataKey="date" tickFormatter={(val) => val ? val.split(" ")[0] : ""} stroke="#9CA3AF" tick={{ fill: '#9CA3AF', fontSize: 12 }} tickMargin={10} minTickGap={30} />
              <YAxis 
                stroke="#9CA3AF" 
                tick={{ fill: '#9CA3AF', fontSize: 12 }} 
                tickFormatter={(val) => (val / 100000000).toFixed(0) + '億'} 
                width={60}
              />
              <Tooltip content={<CustomTooltip />} cursor={{fill: 'rgba(255,255,255,0.05)'}} />
              <Legend wrapperStyle={{ paddingTop: '20px' }} />
              
              <Bar dataKey="外資及陸資" name="外資" stackId="a" fill="#3B82F6" radius={[0, 0, 0, 0]} opacity={0.8} />
              <Bar dataKey="投信" name="投信" stackId="a" fill="#F59E0B" radius={[0, 0, 0, 0]} opacity={0.8} />
              <Bar dataKey="自營商" name="自營商" stackId="a" fill="#10B981" radius={[4, 4, 0, 0]} opacity={0.8} />
              
              <Area 
                type="monotone" 
                dataKey="合計" 
                name="合計" 
                stroke="#A855F7" 
                strokeWidth={3} 
                fillOpacity={1} 
                fill="url(#colorTotal)" 
                activeDot={{ r: 6, strokeWidth: 0, fill: "#D8B4FE", filter: "url(#glow)" }} 
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
};

export default InstitutionalFlow;
