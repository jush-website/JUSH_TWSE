import React, { useState, useEffect } from 'react';
import { getGlobalMarket, getNews, getFutures, getMarketOutlook } from '../services/api';
import { Globe, Newspaper, ExternalLink, TrendingUp, TrendingDown, Activity, BarChart2, Clock, AlertTriangle, CheckCircle } from 'lucide-react';
import ProgressLoader from '../components/ProgressLoader';

const Dashboard = () => {
  const [markets, setMarkets] = useState({});
  const [news, setNews] = useState({ taiwan: [], global: [] });
  const [futures, setFutures] = useState(null);
  const [outlook, setOutlook] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [mRes, nRes, fRes, oRes] = await Promise.all([
          getGlobalMarket(), getNews(), getFutures(), getMarketOutlook()
        ]);
        setMarkets(mRes.data);
        setNews(nRes.data);
        setFutures(fRes.data);
        setOutlook(oRes.data);
      } catch (err) {
        console.error('Dashboard data fetch failed', err);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
    // 每 3 分鐘自動更新
    const interval = setInterval(fetchData, 3 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  if (loading) return <ProgressLoader text="正在載入最新市場概況..." />;

  const trendColor = outlook?.trend === '偏多' || outlook?.trend === '微多' ? 'text-red-400' 
                   : outlook?.trend === '偏空' || outlook?.trend === '微空' ? 'text-green-400' 
                   : 'text-gray-400';
  const trendBg = outlook?.trend === '偏多' || outlook?.trend === '微多' ? 'from-red-900/30 to-orange-900/20 border-red-800/40' 
               : outlook?.trend === '偏空' || outlook?.trend === '微空' ? 'from-green-900/30 to-teal-900/20 border-green-800/40' 
               : 'from-gray-800 to-gray-900 border-gray-700';

  return (
    <div className="space-y-5 sm:space-y-8">
      {/* Market Outlook */}
      {outlook && (
        <section className={`bg-gradient-to-br ${trendBg} rounded-2xl border p-4 sm:p-6 shadow-xl`}>
          <div className="flex items-center justify-between mb-3 sm:mb-4">
            <div className="flex items-center space-x-2">
              <Activity size={24} className={`${trendColor} w-5 h-5 sm:w-6 sm:h-6`} />
              <h2 className="text-lg sm:text-xl font-bold text-white">台股走勢展望</h2>
            </div>
            <div className={`px-3 py-1.5 rounded-full text-sm sm:text-base font-black ${trendColor} bg-gray-900/60 border border-gray-700`}>
              {outlook.trend}
            </div>
          </div>
          <p className="text-gray-200 text-sm sm:text-base mb-3 sm:mb-4 font-medium">{outlook.trend_desc}</p>
          <div className="space-y-1.5">
            {outlook.signals?.map((sig, idx) => (
              <div key={idx} className="flex items-start space-x-2 text-xs sm:text-sm text-gray-300">
                <span className="mt-0.5 shrink-0">{sig.startsWith('✅') ? <CheckCircle size={14} className="text-green-400" /> : <AlertTriangle size={14} className="text-yellow-400" />}</span>
                <span>{sig.replace(/^✅ |^⚠️ /, '')}</span>
              </div>
            ))}
          </div>
          <div className="mt-3 text-[10px] text-gray-500 italic">
            分析基於美股科技指數、台積電ADR、外資資金流向、台指期等三大維度即時評估
          </div>
        </section>
      )}

      {/* Global Markets + Futures */}
      <section>
        <div className="flex items-center space-x-2 mb-2 sm:mb-4 text-blue-400">
          <Globe size={24} className="w-5 h-5 sm:w-6 sm:h-6" />
          <h2 className="text-lg sm:text-xl font-bold">全球市場概況</h2>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-2 sm:gap-4">
          {/* Taiwan Futures Card */}
          {futures && futures.price && (
            <div className="bg-gradient-to-br from-yellow-900/30 to-orange-900/20 p-3 sm:p-4 rounded-lg border border-yellow-800/50 col-span-2 md:col-span-1">
              <div className="flex items-center justify-between">
                <div className="text-yellow-400 text-xs sm:text-sm font-bold">台指期 WTX&</div>
                <span className="text-[10px] bg-yellow-900/50 text-yellow-300 px-1.5 py-0.5 rounded border border-yellow-700">{futures.session}</span>
              </div>
              <div className="text-base sm:text-lg font-bold my-1">{futures.price}</div>
              <div className={`flex items-center text-xs sm:text-sm ${futures.change_pct >= 0 ? 'text-red-400' : 'text-green-400'}`}>
                {futures.change_pct >= 0 ? <TrendingUp size={14} className="mr-1" /> : <TrendingDown size={14} className="mr-1" />}
                {futures.change_pct}%
              </div>
              {futures.date && <div className="text-[10px] text-gray-500 mt-1">{futures.date}</div>}
            </div>
          )}
          {Object.entries(markets).map(([name, data]) => (
            <div key={name} className="bg-gray-800 p-3 sm:p-4 rounded-lg border border-gray-700">
              <div className="text-gray-400 text-xs sm:text-sm">{name}</div>
              <div className="text-base sm:text-lg font-bold my-1">{data.price}</div>
              <div className={`flex items-center text-xs sm:text-sm ${data.change_pct >= 0 ? 'text-red-400' : 'text-green-400'}`}>
                {data.change_pct >= 0 ? <TrendingUp size={14} className="mr-1" /> : <TrendingDown size={14} className="mr-1" />}
                {data.change_pct}%
              </div>
              {data.date && <div className="text-[10px] text-gray-500 mt-1">收盤 {data.date}</div>}
            </div>
          ))}
        </div>
      </section>

      {/* News */}
      <div className="grid md:grid-cols-2 gap-5 sm:gap-8">
        <section>
          <div className="flex items-center justify-between mb-2 sm:mb-4">
            <div className="flex items-center space-x-2 text-orange-400">
              <Newspaper size={24} className="w-5 h-5 sm:w-6 sm:h-6" />
              <h2 className="text-lg sm:text-xl font-bold">台股要聞</h2>
            </div>
            <div className="flex items-center space-x-1 text-[10px] text-gray-500">
              <Clock size={10} />
              <span>即時更新</span>
            </div>
          </div>
          <div className="bg-gray-800 rounded-lg border border-gray-700 divide-y divide-gray-700 max-h-[600px] overflow-y-auto">
            {news.taiwan.map((item, idx) => (
              <a 
                key={idx} 
                href={item.url} 
                target="_blank" 
                rel="noreferrer" 
                className="block p-3 sm:p-4 hover:bg-gray-700 transition"
              >
                <div className="flex justify-between items-start">
                  <h3 className="text-sm font-medium pr-4">{item.title}</h3>
                  <ExternalLink size={14} className="text-gray-500 shrink-0" />
                </div>
                <div className="mt-2 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div className="flex items-center space-x-2 text-[10px] text-gray-500">
                    <span className="font-semibold text-gray-400">{item.source}</span>
                    {item.time && (
                      <span className="flex items-center space-x-0.5">
                        <Clock size={9} />
                        <span>{item.time}</span>
                      </span>
                    )}
                  </div>
                  {item.related_stocks?.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {item.related_stocks.map(sid => (
                        <span key={sid} className="text-[10px] bg-blue-900/50 text-blue-300 px-1.5 py-0.5 rounded border border-blue-800">
                          {sid}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </a>
            ))}
          </div>
        </section>

        <section>
          <div className="flex items-center justify-between mb-2 sm:mb-4">
            <div className="flex items-center space-x-2 text-purple-400">
              <Globe size={24} className="w-5 h-5 sm:w-6 sm:h-6" />
              <h2 className="text-lg sm:text-xl font-bold">國際財經</h2>
            </div>
            <div className="flex items-center space-x-1 text-[10px] text-gray-500">
              <Clock size={10} />
              <span>即時更新</span>
            </div>
          </div>
          <div className="bg-gray-800 rounded-lg border border-gray-700 divide-y divide-gray-700 max-h-[600px] overflow-y-auto">
            {news.global.map((item, idx) => (
              <a 
                key={idx} 
                href={item.url} 
                target="_blank" 
                rel="noreferrer" 
                className="block p-3 sm:p-4 hover:bg-gray-700 transition"
              >
                <div className="flex justify-between items-start">
                  <h3 className="text-sm font-medium pr-4">{item.title}</h3>
                  <ExternalLink size={14} className="text-gray-500 shrink-0" />
                </div>
                <div className="mt-2 flex items-center space-x-2 text-[10px] text-gray-500">
                  <span className="font-semibold text-gray-400">{item.source}</span>
                  {item.time && (
                    <span className="flex items-center space-x-0.5">
                      <Clock size={9} />
                      <span>{item.time}</span>
                    </span>
                  )}
                </div>
              </a>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
};

export default Dashboard;
