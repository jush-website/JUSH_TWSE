import React, { useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { Search, Activity, Home, TrendingUp, BarChart2, Menu, X, ChevronDown, ChevronRight } from 'lucide-react';

const Navbar = ({ status }) => {
  const [query, setQuery] = useState('');
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isMobileStrategiesOpen, setIsMobileStrategiesOpen] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();

  const handleSearch = (e) => {
    e.preventDefault();
    if (query.trim()) {
      navigate(`/analyze/${query}`);
      setQuery('');
      setIsMobileMenuOpen(false);
    }
  };

  const strategies = [
    { path: '/recommendations/burst', label: '強勢爆發 (短線動能)' },
    { path: '/recommendations/short-term', label: '短線衝刺 (技術指標)' },
    { path: '/recommendations/overnight', label: '隔日沖偵測 (尾盤大戶)' },
    { path: '/recommendations/bottom', label: '抄底推薦 (超跌反彈)' },
    { path: '/recommendations/long-term', label: '長期精選 (價值存股)' },
    { path: '/recommendations/etf', label: 'ETF 佈局 (穩健配置)' },
    { path: '/recommendations/cdp', label: 'CDP 逆勢 (當沖預覽)' }
  ];

  return (
    <nav className="sticky top-0 z-50 w-full backdrop-blur-xl bg-gray-900/80 border-b border-white/10 transition-all duration-300 shadow-2xl">
      <div className="container mx-auto px-4 lg:px-8 py-3">
        <div className="flex items-center justify-between">
          
          {/* Logo Section */}
          <Link to="/" className="flex items-center space-x-3 group">
            <div className="bg-gradient-to-br from-blue-500 to-cyan-400 p-2 rounded-xl group-hover:scale-105 transition-transform duration-300 shadow-lg shadow-blue-500/20">
              <TrendingUp size={24} className="text-white" />
            </div>
            <span className="font-extrabold text-xl tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-blue-400 via-cyan-300 to-blue-200">
              台股偵測系統
            </span>
          </Link>
          
          {/* Desktop Menu */}
          <div className="hidden lg:flex items-center space-x-8">
            <Link 
              to="/" 
              className={`flex items-center space-x-2 font-medium transition-all duration-200 hover:text-cyan-400 ${location.pathname === '/' ? 'text-cyan-400' : 'text-gray-300'}`}
            >
              <Home size={18} />
              <span>首頁</span>
            </Link>
            
            <div className="group relative">
              <button className={`flex items-center space-x-2 font-medium transition-all duration-200 hover:text-cyan-400 ${location.pathname.includes('/recommendations') ? 'text-cyan-400' : 'text-gray-300'}`}>
                <BarChart2 size={18} />
                <span>精選策略</span>
                <ChevronDown size={16} className="group-hover:rotate-180 transition-transform duration-300" />
              </button>
              
              {/* Dropdown Menu */}
              <div className="absolute top-full left-0 mt-4 w-64 opacity-0 translate-y-2 invisible group-hover:opacity-100 group-hover:translate-y-0 group-hover:visible transition-all duration-300 ease-out">
                <div className="bg-gray-800/95 backdrop-blur-lg border border-white/10 rounded-2xl shadow-2xl overflow-hidden py-2">
                  {strategies.map((item, idx) => (
                    <Link 
                      key={idx}
                      to={item.path} 
                      className="flex items-center justify-between px-5 py-3 hover:bg-white/5 text-gray-300 hover:text-cyan-300 transition-colors group/item"
                    >
                      <span className="text-sm font-medium">{item.label}</span>
                      <ChevronRight size={14} className="opacity-0 -translate-x-2 group-hover/item:opacity-100 group-hover/item:translate-x-0 transition-all duration-200 text-cyan-400" />
                    </Link>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Right Section: Search & Status */}
          <div className="hidden lg:flex items-center space-x-6">
            <form onSubmit={handleSearch} className="relative group">
              <input
                type="text"
                placeholder="輸入代號或名稱..."
                className="bg-gray-800/50 border border-gray-700/50 rounded-full py-2 pl-11 pr-5 text-sm text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-cyan-500/50 focus:bg-gray-800 transition-all duration-300 w-48 focus:w-64"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
              <Search className="absolute left-4 top-2.5 text-gray-400 group-focus-within:text-cyan-400 transition-colors" size={16} />
            </form>

            {status && (
              <div className="flex flex-col border-l border-white/10 pl-5">
                <div className="flex items-center space-x-2">
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
                  </span>
                  <span className="text-xs font-semibold text-green-400 tracking-wide">{status.market_status}</span>
                </div>
                <span className="text-[10px] text-gray-500 font-mono mt-0.5">{status.data_date}</span>
              </div>
            )}
          </div>

          {/* Mobile Menu Toggle */}
          <div className="lg:hidden flex items-center">
            <button onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)} className="text-gray-300 hover:text-white focus:outline-none p-2">
              {isMobileMenuOpen ? <X size={26} /> : <Menu size={26} />}
            </button>
          </div>
        </div>
      </div>

      {/* Mobile Menu Drawer */}
      <div className={`lg:hidden overflow-hidden transition-all duration-300 ease-in-out ${isMobileMenuOpen ? 'max-h-[500px] opacity-100' : 'max-h-0 opacity-0'}`}>
        <div className="px-4 pt-2 pb-6 space-y-4 bg-gray-900 border-t border-white/10">
          <form onSubmit={handleSearch} className="relative w-full mt-4">
            <input
              type="text"
              placeholder="輸入代號或名稱..."
              className="w-full bg-gray-800 border border-gray-700 rounded-xl py-3 pl-11 pr-5 text-white placeholder-gray-400 focus:ring-2 focus:ring-cyan-500"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <Search className="absolute left-4 top-3.5 text-gray-400" size={18} />
          </form>

          <Link to="/" onClick={() => setIsMobileMenuOpen(false)} className="block px-4 py-3 rounded-xl hover:bg-gray-800 text-gray-300 font-medium">
            <div className="flex items-center space-x-3"><Home size={18} /><span>首頁</span></div>
          </Link>
          
          <div className="rounded-xl overflow-hidden">
            <button 
              onClick={() => setIsMobileStrategiesOpen(!isMobileStrategiesOpen)}
              className="w-full flex items-center justify-between px-4 py-3 bg-gray-800/50 hover:bg-gray-800 text-gray-300 font-medium transition-colors"
            >
              <div className="flex items-center space-x-3"><BarChart2 size={18} /><span>精選策略</span></div>
              <ChevronDown size={18} className={`transition-transform duration-300 ${isMobileStrategiesOpen ? 'rotate-180 text-cyan-400' : ''}`} />
            </button>
            <div className={`transition-all duration-300 ${isMobileStrategiesOpen ? 'max-h-[400px]' : 'max-h-0'} overflow-hidden bg-gray-900/50`}>
              {strategies.map((item, idx) => (
                <Link 
                  key={idx}
                  to={item.path} 
                  onClick={() => setIsMobileMenuOpen(false)}
                  className="block px-12 py-3 text-sm text-gray-400 hover:text-cyan-400 hover:bg-gray-800/50 transition-colors"
                >
                  {item.label}
                </Link>
              ))}
            </div>
          </div>
        </div>
      </div>
    </nav>
  );
};

export default Navbar;
