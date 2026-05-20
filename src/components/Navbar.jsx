import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Search, Activity, Home, TrendingUp, BarChart2 } from 'lucide-react';

const Navbar = ({ status }) => {
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
      <div className="container mx-auto px-4 py-3 flex flex-wrap items-center justify-between">
        <div className="flex items-center space-x-6">
          <Link to="/" className="flex items-center space-x-2 text-blue-400 font-bold text-xl">
            <TrendingUp size={28} />
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

        <div className="flex items-center space-x-4 mt-2 sm:mt-0">
          <form onSubmit={handleSearch} className="relative">
            <input
              type="text"
              placeholder="代號或名稱..."
              className="bg-gray-700 border-none rounded-full py-1.5 pl-10 pr-4 focus:ring-2 focus:ring-blue-500 w-40 sm:w-64"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <Search className="absolute left-3 top-2 text-gray-400" size={18} />
          </form>

          {status && (
            <div className="hidden lg:flex flex-col text-xs text-gray-400 border-l border-gray-700 pl-4">
              <div className="flex items-center space-x-1">
                <Activity size={12} className="text-green-500" />
                <span>{status.market_status}</span>
              </div>
              <span>數據日期: {status.data_date}</span>
            </div>
          )}
        </div>
      </div>
    </nav>
  );
};

export default Navbar;
