import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Search, Activity, Home, TrendingUp, BarChart2, Clock } from 'lucide-react';

const Navbar = ({ status, lastUpdated }) => {
  const [query, setQuery] = useState('');
  const navigate = useNavigate();

  const handleSearch = (e) => {
    e.preventDefault();
    if (query.trim()) {
      navigate(`/analyze/${query}`);
      setQuery('');
    }
  };

  return (
    <nav className="bg-gray-800 border-b border-gray-700 sticky top-0 z-50">
      <div className="container mx-auto px-2 sm:px-4 py-2 sm:py-3 flex flex-wrap items-center justify-between">
        <div className="flex items-center space-x-3 sm:space-x-6">
          <Link to="/" className="flex items-center space-x-1 sm:space-x-2 text-blue-400 font-bold text-lg sm:text-xl">
            <TrendingUp size={24} className="sm:w-7 sm:h-7" />
            <span>台股偵測系統</span>
          </Link>
          
          <div className="hidden md:flex space-x-4">
            <Link to="/" className="hover:text-blue-400 flex items-center space-x-1">
              <Home size={18} />
              <span>首頁</span>
            </Link>
            <div className="group relative">
              <button className="hover:text-blue-400 flex items-center space-x-1">
                <BarChart2 size={18} />
                <span>精選推薦</span>
              </button>
              <div className="absolute left-0 mt-2 w-48 bg-gray-800 border border-gray-700 rounded shadow-xl hidden group-hover:block overflow-hidden">
                <Link to="/recommendations/short-term" className="block px-4 py-2 hover:bg-gray-700">短線極佳</Link>
                <Link to="/recommendations/overnight" className="block px-4 py-2 hover:bg-gray-700">隔日沖動能</Link>
                <Link to="/recommendations/burst" className="block px-4 py-2 hover:bg-gray-700">強勢爆發</Link>
                <Link to="/recommendations/bottom" className="block px-4 py-2 hover:bg-gray-700">抄底絕佳</Link>
                <Link to="/recommendations/long-term" className="block px-4 py-2 hover:bg-gray-700">長期精選</Link>
              </div>
            </div>
          </div>
        </div>

        <div className="flex items-center space-x-2 sm:space-x-4 mt-2 sm:mt-0 w-full sm:w-auto">
          <form onSubmit={handleSearch} className="relative flex-1 sm:flex-none">
            <input
              type="text"
              placeholder="代號或名稱..."
              className="bg-gray-700 border-none rounded-full py-1 sm:py-1.5 pl-9 pr-3 sm:pl-10 sm:pr-4 focus:ring-2 focus:ring-blue-500 w-full sm:w-64 text-sm sm:text-base"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <Search className="absolute left-3 top-1.5 sm:top-2 text-gray-400" size={16} />
          </form>

          {status && (
            <div className="hidden lg:flex flex-col text-[11px] sm:text-xs text-gray-400 border-l border-gray-700 pl-4 space-y-0.5 sm:space-y-1 justify-center">
              <div className="flex items-center space-x-1">
                <Activity size={12} className="text-green-500" />
                <span className="font-medium text-gray-300">{status.market_status}</span>
              </div>
              <div className="flex items-center space-x-1" title="資料庫最後更新時間">
                <Clock size={12} className="text-blue-400" />
                <span>更新: {lastUpdated ?? '讀取中...'}</span>
              </div>
            </div>
          )}
        </div>
      </div>
    </nav>
  );
};

export default Navbar;
