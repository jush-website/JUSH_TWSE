import React, { useState, useEffect } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { Search, Activity, Home, TrendingUp, BarChart2, Menu, X, ChevronDown, ChevronRight, Flame } from 'lucide-react';

// 前端即時計算市場狀態（不依賴 Firebase）
const getLocalMarketStatus = () => {
  const now = new Date();
  const day = now.getDay(); // 0=日, 6=六
  const h = now.getHours();
  const m = now.getMinutes();
  const totalMin = h * 60 + m;
  if (day === 0 || day === 6) return { label: '週末休市', color: 'text-gray-400', dot: 'bg-gray-500' };
  if (totalMin < 9 * 60) return { label: '盤前 (昨收數據)', color: 'text-yellow-400', dot: 'bg-yellow-500' };
  if (totalMin < 13 * 60 + 30) return { label: '盤中 (即時行情)', color: 'text-green-400', dot: 'bg-green-500' };
  if (totalMin < 14 * 60) return { label: '盤後 (收盤穩衝中)', color: 'text-orange-400', dot: 'bg-orange-500' };
  return { label: '盤後 (今日收盤)', color: 'text-blue-400', dot: 'bg-blue-500' };
};

const Navbar = ({ status }) => {
  const [query, setQuery] = useState('');
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isMobileStrategiesOpen, setIsMobileStrategiesOpen] = useState(false);
  const [marketStatus, setMarketStatus] = useState(getLocalMarketStatus());
  const navigate = useNavigate();
  const location = useLocation();

  // 每分鐘更新市場狀態
  useEffect(() => {
    const timer = setInterval(() => {
      setMarketStatus(getLocalMarketStatus());
    }, 60000);
    return () => clearInterval(timer);
  }, []);

  const handleSearch = (e) => {
    e.preventDefault();
    if (query.trim()) {
      navigate(`/analyze/${query}`);
      setQuery('');
      setIsMobileMenuOpen(false);
    }
  };

  const strategies = [
    { path: '/recommendations/short-term', label: '短線' },
    { path: '/recommendations/overnight', label: '隔日沖' },
    { path: '/recommendations/burst', label: '爆發' },
    { path: '/recommendations/day-trade-cdp', label: '當沖' },
    { path: '/recommendations/bottom', label: '抄底' },
    { path: '/recommendations/long-term', label: '長期' }
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
          <div className="hidden lg:flex items-center space-x-4 xl:space-x-6">
            <Link 
              to="/" 
              className={`flex items-center space-x-1.5 font-medium transition-all duration-200 hover:text-cyan-400 ${location.pathname === '/' ? 'text-cyan-400' : 'text-gray-300'}`}
            >
              <Home size={16} />
              <span className="text-sm">首頁</span>
            </Link>

            <Link 
              to="/capital-flow" 
              className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-full transition-all duration-200 ${
                location.pathname === '/capital-flow' ? 'bg-orange-500/20 text-orange-400 font-bold shadow-[0_0_10px_rgba(249,115,22,0.3)]' : 'hover:bg-gray-800 text-gray-300'
              }`}
            >
              <Flame size={16} />
              <span className="text-sm">資金流向</span>
            </Link>

            <div className="h-4 w-px bg-white/20 mx-1"></div>
            
            <Link 
              to="/analyze" 
              className={`flex items-center space-x-1.5 font-medium transition-all duration-200 hover:text-cyan-400 ${location.pathname.includes('/analyze') ? 'text-cyan-400' : 'text-gray-300'}`}
            >
              <Search size={16} />
              <span className="text-sm">個股分析</span>
            </Link>

            <div className="h-4 w-px bg-white/20 mx-1"></div>

            <Link 
              to="/macro" 
              className={`flex items-center space-x-1.5 font-medium transition-all duration-200 hover:text-cyan-400 ${location.pathname === '/macro' ? 'text-cyan-400' : 'text-gray-300'}`}
            >
              <Activity size={16} />
              <span className="text-sm">總體經濟</span>
            </Link>

            <Link 
              to="/derivatives" 
              className={`flex items-center space-x-1.5 font-medium transition-all duration-200 hover:text-cyan-400 ${location.pathname === '/derivatives' ? 'text-cyan-400' : 'text-gray-300'}`}
            >
              <TrendingUp size={16} />
              <span className="text-sm">期權籌碼</span>
            </Link>

            <div className="h-4 w-px bg-white/20 mx-1"></div>

            <Link to="/recommendations/short-term" className={`text-sm font-medium transition-colors hover:text-blue-400 ${location.pathname.includes('short-term') ? 'text-blue-400' : 'text-gray-300'}`}>短線</Link>
            <Link to="/recommendations/overnight" className={`text-sm font-medium transition-colors hover:text-purple-400 ${location.pathname.includes('overnight') ? 'text-purple-400' : 'text-gray-300'}`}>隔日沖</Link>
            <Link to="/recommendations/burst" className={`text-sm font-medium transition-colors hover:text-orange-400 ${location.pathname.includes('burst') ? 'text-orange-400' : 'text-gray-300'}`}>爆發</Link>
            <Link to="/recommendations/day-trade-cdp" className={`text-sm font-medium transition-colors hover:text-pink-400 ${location.pathname.includes('day-trade-cdp') ? 'text-pink-400' : 'text-gray-300'}`}>當沖</Link>
            <Link to="/recommendations/bottom" className={`text-sm font-medium transition-colors hover:text-emerald-400 ${location.pathname.includes('bottom') ? 'text-emerald-400' : 'text-gray-300'}`}>抄底</Link>
            <Link to="/recommendations/long-term" className={`text-sm font-medium transition-colors hover:text-indigo-400 ${location.pathname.includes('long-term') ? 'text-indigo-400' : 'text-gray-300'}`}>長期</Link>
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

            {(
              <div className="flex flex-col border-l border-white/10 pl-5">
                <div className="flex items-center space-x-2">
                  <span className="relative flex h-2 w-2">
                    <span className={`animate-ping absolute inline-flex h-full w-full rounded-full ${marketStatus.dot} opacity-75`}></span>
                    <span className={`relative inline-flex rounded-full h-2 w-2 ${marketStatus.dot}`}></span>
                  </span>
                  <span className={`text-xs font-semibold tracking-wide ${marketStatus.color}`}>{marketStatus.label}</span>
                </div>
                <span className="text-[10px] text-gray-500 font-mono mt-0.5">
                  {status?.last_sync ? `更新: ${status.last_sync}` : '同步中...'}
                </span>
              </div>
            )}
          </div>

          {/* Mobile Status & Menu Toggle */}
          <div className="lg:hidden flex items-center space-x-2">
            <div className="flex flex-col items-end mr-1">
              <div className="flex items-center space-x-1.5">
                <span className={`text-[10px] font-semibold ${marketStatus.color}`}>{marketStatus.label}</span>
                <span className="relative flex h-1.5 w-1.5">
                  <span className={`animate-ping absolute inline-flex h-full w-full rounded-full ${marketStatus.dot} opacity-75`}></span>
                  <span className={`relative inline-flex rounded-full h-1.5 w-1.5 ${marketStatus.dot}`}></span>
                </span>
              </div>
              <span className="text-[9px] text-gray-500 font-mono">
                {status?.last_sync ? `更新: ${status.last_sync}` : '同步中...'}
              </span>
            </div>
            
            <Link 
              to="/capital-flow" 
              className={`p-1 rounded-md transition-all ${location.pathname === '/capital-flow' ? 'bg-orange-500/20 text-orange-400 border border-orange-500/30' : 'bg-white/5 text-gray-300 hover:text-orange-400 border border-white/5'}`}
            >
              <Flame size={20} />
            </Link>

            <button onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)} className="text-gray-300 hover:text-white focus:outline-none p-1 border border-white/5 rounded-md bg-white/5">
              {isMobileMenuOpen ? <X size={20} /> : <Menu size={20} />}
            </button>
          </div>
        </div>
      </div>

      {/* Mobile Menu Drawer */}
      <div className={`lg:hidden overflow-y-auto transition-all duration-300 ease-in-out ${isMobileMenuOpen ? 'max-h-[85vh] opacity-100' : 'max-h-0 opacity-0'}`}>
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
          
          <Link to="/analyze" onClick={() => setIsMobileMenuOpen(false)} className="block px-4 py-3 rounded-xl hover:bg-gray-800 text-gray-300 font-medium">
            <div className="flex items-center space-x-3"><Search size={18} /><span>個股診斷</span></div>
          </Link>

          <Link to="/capital-flow" onClick={() => setIsMobileMenuOpen(false)} className="block px-4 py-3 rounded-xl hover:bg-gray-800 text-gray-300 font-medium">
            <div className="flex items-center space-x-3"><Flame size={18} className={location.pathname === '/capital-flow' ? "text-orange-400" : ""} /><span className={location.pathname === '/capital-flow' ? "text-orange-400 font-bold" : ""}>資金流向</span></div>
          </Link>

          <Link to="/macro" onClick={() => setIsMobileMenuOpen(false)} className="block px-4 py-3 rounded-xl hover:bg-gray-800 text-gray-300 font-medium">
            <div className="flex items-center space-x-3"><Activity size={18} className={location.pathname === '/macro' ? "text-cyan-400" : ""} /><span className={location.pathname === '/macro' ? "text-cyan-400 font-bold" : ""}>總體經濟</span></div>
          </Link>

          <Link to="/derivatives" onClick={() => setIsMobileMenuOpen(false)} className="block px-4 py-3 rounded-xl hover:bg-gray-800 text-gray-300 font-medium">
            <div className="flex items-center space-x-3"><TrendingUp size={18} className={location.pathname === '/derivatives' ? "text-cyan-400" : ""} /><span className={location.pathname === '/derivatives' ? "text-cyan-400 font-bold" : ""}>期權籌碼</span></div>
          </Link>
          
          <div className="py-2">
            <div className="px-4 text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2 mt-2">精選策略</div>
            {strategies.map((item, idx) => (
              <Link 
                key={idx}
                to={item.path} 
                onClick={() => setIsMobileMenuOpen(false)}
                className="flex items-center space-x-3 px-4 py-3 rounded-xl text-sm text-gray-300 hover:text-cyan-400 hover:bg-gray-800 transition-colors"
              >
                <BarChart2 size={16} className="opacity-50" />
                <span>{item.label}</span>
              </Link>
            ))}
          </div>
        </div>
      </div>
    </nav>
  );
};

export default Navbar;
