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
      <div className="card p-3.5 min-w-[200px] shadow-card-lg">
        <p className="text-ink-2 text-xs mb-2.5 border-b border-line pb-2 font-semibold">{label}</p>
        <div className="space-y-1.5">
          {payload.map((entry, index) => {
            const isTotal = entry.dataKey === '合計';
            const val = Number(entry.value);
            return (
              <div key={index} className={`flex justify-between items-center text-xs ${isTotal ? 'mt-2 pt-2 border-t border-line font-bold' : ''}`}>
                <span style={{ color: entry.color }}>{entry.name}</span>
                <span className={`font-mono nums ${val > 0 ? 'text-bull' : val < 0 ? 'text-bear' : 'text-ink-3'}`}>
                  {formatValue(val)}
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
    const interval = setInterval(fetchData, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  if (loading) return <ProgressLoader text="正在載入法人資金動向..." />;
  if (error) return <div className="text-center py-20 text-red-400 font-bold flex flex-col items-center"><ShieldAlert size={48} className="mb-4" />{error}</div>;
  if (data && data.error) return <div className="text-center py-20 text-red-400 font-bold flex flex-col items-center"><ShieldAlert size={48} className="mb-4" />FinMind API 錯誤或達到呼叫上限，請稍後再試。<br/><span className="text-sm mt-2 font-normal text-red-400/70">({data.error})</span></div>;
  if (!data || !Array.isArray(data) || data.length === 0) return <div className="text-center py-20 text-ink-3">目前沒有法人買賣超資料</div>;

  const latestData = data[data.length - 1];
  
  const StatCard = ({ title, value }) => {
    const pos = value > 0;
    return (
      <div className="card p-4 sm:p-5">
        <h3 className="text-ink-3 text-xs font-medium mb-2">{title}</h3>
        <div className={`text-xl sm:text-2xl font-bold tracking-tight nums ${pos ? 'text-bull' : value < 0 ? 'text-bear' : 'text-ink-2'}`}>
          {pos ? '+' : ''}{formatValue(value)}
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-5 pb-10">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-line pb-4 gap-3">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Building size={18} className="text-ink-3" />
            <h1 className="text-xl font-bold text-ink-1">三大法人買賣超</h1>
          </div>
          <p className="text-ink-3 text-sm">追蹤外資、投信、自營商的資金動向，掌握大盤籌碼方向</p>
        </div>
        <div className="flex items-center gap-1.5 text-xs text-ink-3 bg-overlay px-3 py-1.5 rounded-full border border-line w-fit">
          <Clock size={12} />
          <span>最新資料：{latestData.date ? latestData.date.split(' ')[0] : ''}</span>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard title="外資及陸資" value={latestData['外資及陸資'] || 0} />
        <StatCard title="投信"       value={latestData['投信']       || 0} />
        <StatCard title="自營商"     value={latestData['自營商']     || 0} />
        <StatCard title="三大法人合計" value={latestData['合計']    || 0} />
      </div>

      <div className="card p-5">
        <h2 className="font-semibold text-ink-1 flex items-center gap-2 mb-5">
          <TrendingUp size={16} className="text-ink-3" /> 近 30 日資金流向趨勢
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
