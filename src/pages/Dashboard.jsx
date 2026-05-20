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
    <div className="space-y-8">
      {/* Global Markets */}
      <section>
        <div className="flex items-center space-x-2 mb-4 text-blue-400">
          <Globe size={24} />
          <h2 className="text-xl font-bold">全球市場概況</h2>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
          {Object.entries(markets).map(([name, data]) => (
            <div key={name} className="bg-gray-800 p-4 rounded-lg border border-gray-700">
              <div className="text-gray-400 text-sm">{name}</div>
              <div className="text-lg font-bold my-1">{data.price}</div>
              <div className={`flex items-center text-sm ${data.change_pct >= 0 ? 'text-red-400' : 'text-green-400'}`}>
                {data.change_pct >= 0 ? <TrendingUp size={14} className="mr-1" /> : <TrendingDown size={14} className="mr-1" />}
                {data.change_pct}%
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* News */}
      <div className="grid md:grid-cols-2 gap-8">
        <section>
          <div className="flex items-center space-x-2 mb-4 text-orange-400">
            <Newspaper size={24} />
            <h2 className="text-xl font-bold">台股要聞</h2>
          </div>
          <div className="bg-gray-800 rounded-lg border border-gray-700 divide-y divide-gray-700">
            {news.taiwan.map((item, idx) => (
              <a 
                key={idx} 
                href={item.url} 
                target="_blank" 
                rel="noreferrer" 
                className="block p-4 hover:bg-gray-700 transition"
              >
                <div className="flex justify-between items-start">
                  <h3 className="text-sm font-medium pr-4">{item.title}</h3>
                  <ExternalLink size={14} className="text-gray-500 shrink-0" />
                </div>
                {item.related_stocks?.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {item.related_stocks.map(sid => (
                      <span key={sid} className="text-[10px] bg-blue-900 text-blue-200 px-2 py-0.5 rounded">
                        {sid}
                      </span>
                    ))}
                  </div>
                )}
              </a>
            ))}
          </div>
        </section>

        <section>
          <div className="flex items-center space-x-2 mb-4 text-purple-400">
            <Globe size={24} />
            <h2 className="text-xl font-bold">國際財經</h2>
          </div>
          <div className="bg-gray-800 rounded-lg border border-gray-700 divide-y divide-gray-700">
            {news.global.map((item, idx) => (
              <a 
                key={idx} 
                href={item.url} 
                target="_blank" 
                rel="noreferrer" 
                className="block p-4 hover:bg-gray-700 transition"
              >
                <div className="flex justify-between items-start">
                  <h3 className="text-sm font-medium pr-4">{item.title}</h3>
                  <ExternalLink size={14} className="text-gray-500 shrink-0" />
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
