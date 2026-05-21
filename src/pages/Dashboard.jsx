import React, { useState, useEffect } from 'react';
import { getGlobalMarket, getNews } from '../services/api';
import { Globe, Newspaper, ExternalLink, TrendingUp, TrendingDown } from 'lucide-react';

const Dashboard = () => {
  const [markets, setMarkets] = useState({});
  const [news, setNews] = useState({ taiwan: [], global: [] });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [mRes, nRes] = await Promise.all([getGlobalMarket(), getNews()]);
        setMarkets(mRes.data);
        setNews(nRes.data);
      } catch (err) {
        console.error('Dashboard data fetch failed', err);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  if (loading) return <div className="text-center py-20 text-gray-400">載入中...</div>;

  return (
    <div className="space-y-5 sm:space-y-8">
      {/* Global Markets */}
      <section>
        <div className="flex items-center space-x-2 mb-2 sm:mb-4 text-blue-400">
          <Globe size={24} className="w-5 h-5 sm:w-6 sm:h-6" />
          <h2 className="text-lg sm:text-xl font-bold">全球市場概況</h2>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-2 sm:gap-4">
          {Object.entries(markets).map(([name, data]) => (
            <div key={name} className="bg-gray-800 p-3 sm:p-4 rounded-lg border border-gray-700">
              <div className="text-gray-400 text-xs sm:text-sm">{name}</div>
              <div className="text-base sm:text-lg font-bold my-1">{data.price}</div>
              <div className={`flex items-center text-xs sm:text-sm ${data.change_pct >= 0 ? 'text-red-400' : 'text-green-400'}`}>
                {data.change_pct >= 0 ? <TrendingUp size={14} className="mr-1" /> : <TrendingDown size={14} className="mr-1" />}
                {data.change_pct}%
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* News */}
      <div className="grid md:grid-cols-2 gap-5 sm:gap-8">
        <section>
          <div className="flex items-center space-x-2 mb-2 sm:mb-4 text-orange-400">
            <Newspaper size={24} className="w-5 h-5 sm:w-6 sm:h-6" />
            <h2 className="text-lg sm:text-xl font-bold">台股要聞</h2>
          </div>
          <div className="bg-gray-800 rounded-lg border border-gray-700 divide-y divide-gray-700">
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
                    {item.time && <span>• {item.time}</span>}
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
          <div className="flex items-center space-x-2 mb-2 sm:mb-4 text-purple-400">
            <Globe size={24} className="w-5 h-5 sm:w-6 sm:h-6" />
            <h2 className="text-lg sm:text-xl font-bold">國際財經</h2>
          </div>
          <div className="bg-gray-800 rounded-lg border border-gray-700 divide-y divide-gray-700">
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
                  {item.time && <span>• {item.time}</span>}
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
