import React, { useState, useEffect } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import {
  Search, Activity, Home, TrendingUp, BarChart2,
  Menu, X, Flame, Globe, ChevronDown,
} from 'lucide-react';
import ThemeToggle from './ThemeToggle';

const getLocalMarketStatus = () => {
  const now = new Date();
  const day = now.getDay();
  const total = now.getHours() * 60 + now.getMinutes();
  if (day === 0 || day === 6)  return { label: '週末休市',        dot: 'bg-ink-3',    text: 'text-ink-3' };
  if (total < 9 * 60)          return { label: '盤前',            dot: 'bg-yellow-500', text: 'text-yellow-600 dark:text-yellow-400' };
  if (total < 13 * 60 + 30)   return { label: '盤中 · 即時',     dot: 'bg-bear',       text: 'text-bear' };
  if (total < 14 * 60)        return { label: '盤後收盤中',       dot: 'bg-orange-500', text: 'text-orange-600 dark:text-orange-400' };
  return                              { label: '今日收盤',         dot: 'bg-brand',      text: 'text-brand' };
};

const NAV_LINKS = [
  { path: '/',              label: '首頁',    icon: Home },
  { path: '/capital-flow', label: '資金流向', icon: Flame },
  { path: '/analyze',      label: '個股分析', icon: Search },
  { path: '/macro',        label: '總體經濟', icon: Globe },
  { path: '/derivatives',  label: '期權籌碼', icon: TrendingUp },
];

const STRATEGIES = [
  { path: '/recommendations/short-term',    label: '短線極佳' },
  { path: '/recommendations/overnight',     label: '隔日沖' },
  { path: '/recommendations/burst',         label: '強勢爆發' },
  { path: '/recommendations/day-trade-cdp', label: '當沖 CDP' },
  { path: '/recommendations/bottom',        label: '抄底' },
  { path: '/recommendations/long-term',     label: '長期精選' },
];

const Navbar = React.forwardRef(({ status }, ref) => {
  const [query, setQuery] = useState('');
  const [mobileOpen, setMobileOpen] = useState(false);
  const [stratOpen, setStratOpen] = useState(false);
  const [marketStatus, setMarketStatus] = useState(getLocalMarketStatus());
  const navigate  = useNavigate();
  const location  = useLocation();

  useEffect(() => {
    const t = setInterval(() => setMarketStatus(getLocalMarketStatus()), 60000);
    return () => clearInterval(t);
  }, []);

  // Close dropdown on route change
  useEffect(() => { setMobileOpen(false); setStratOpen(false); }, [location.pathname]);

  const handleSearch = (e) => {
    e.preventDefault();
    if (query.trim()) { navigate(`/analyze/${query.trim()}`); setQuery(''); }
  };

  const isActive = (path) =>
    path === '/' ? location.pathname === '/' : location.pathname.startsWith(path);

  const linkCls = (path) =>
    `flex items-center gap-1.5 text-sm font-medium px-2.5 py-1.5 rounded-md transition-colors duration-150 ${
      isActive(path)
        ? 'bg-brand-muted text-brand'
        : 'text-ink-2 hover:text-ink-1 hover:bg-overlay'
    }`;

  return (
    <nav
      ref={ref}
      className="sticky top-0 z-50 bg-panel/90 backdrop-blur-md border-b border-line transition-colors duration-300"
    >
      <div className="container mx-auto px-4 max-w-7xl">
        <div className="flex items-center justify-between h-14">

          {/* Logo */}
          <Link to="/" className="flex items-center gap-2.5 shrink-0">
            <div className="w-7 h-7 rounded-lg bg-brand flex items-center justify-center">
              <TrendingUp size={14} className="text-brand-fg" strokeWidth={2.5} />
            </div>
            <span className="font-bold text-base text-ink-1 tracking-tight hidden sm:block">
              台股偵測系統
            </span>
          </Link>

          {/* Desktop Nav */}
          <div className="hidden lg:flex items-center gap-0.5">
            {NAV_LINKS.map(({ path, label }) => (
              <Link key={path} to={path} className={linkCls(path)}>
                {label}
              </Link>
            ))}

            {/* Strategies dropdown */}
            <div className="relative">
              <button
                onClick={() => setStratOpen(o => !o)}
                className={`flex items-center gap-1.5 text-sm font-medium px-2.5 py-1.5 rounded-md transition-colors duration-150 ${
                  location.pathname.includes('/recommendations')
                    ? 'bg-brand-muted text-brand'
                    : 'text-ink-2 hover:text-ink-1 hover:bg-overlay'
                }`}
              >
                <BarChart2 size={14} />
                策略選股
                <ChevronDown size={12} className={`transition-transform duration-150 ${stratOpen ? 'rotate-180' : ''}`} />
              </button>
              {stratOpen && (
                <div className="absolute top-full left-0 mt-1.5 w-40 bg-panel border border-line rounded-xl shadow-card-lg overflow-hidden z-50">
                  {STRATEGIES.map(({ path, label }) => (
                    <Link
                      key={path}
                      to={path}
                      className={`block px-3.5 py-2.5 text-sm transition-colors ${
                        location.pathname === path
                          ? 'bg-brand-muted text-brand font-medium'
                          : 'text-ink-2 hover:bg-overlay hover:text-ink-1'
                      }`}
                    >
                      {label}
                    </Link>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Right: search + status + theme */}
          <div className="hidden lg:flex items-center gap-3">
            <form onSubmit={handleSearch} className="relative">
              <input
                type="text"
                placeholder="代號或名稱..."
                value={query}
                onChange={e => setQuery(e.target.value)}
                className="bg-overlay border border-line rounded-lg py-1.5 pl-8 pr-3 text-sm text-ink-1 placeholder:text-ink-3 focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand w-40 focus:w-52 transition-all duration-200"
              />
              <Search className="absolute left-2.5 top-2 text-ink-3" size={14} />
            </form>

            {/* Market status */}
            <div className="flex flex-col items-end border-l border-line pl-3">
              <div className="flex items-center gap-1.5">
                <span className="relative flex h-1.5 w-1.5">
                  <span className={`animate-ping absolute inset-0 rounded-full ${marketStatus.dot} opacity-60`} />
                  <span className={`relative rounded-full h-1.5 w-1.5 ${marketStatus.dot}`} />
                </span>
                <span className={`text-xs font-semibold ${marketStatus.text}`}>{marketStatus.label}</span>
              </div>
              <span className="text-[10px] text-ink-3 font-mono mt-0.5 leading-none">
                {status?.last_sync ? `更新 ${status.last_sync}` : '同步中...'}
              </span>
            </div>

            <ThemeToggle />
          </div>

          {/* Mobile right */}
          <div className="lg:hidden flex items-center gap-1.5">
            <div className="flex flex-col items-end mr-1">
              <div className="flex items-center gap-1">
                <span className={`text-[10px] font-semibold ${marketStatus.text}`}>{marketStatus.label}</span>
                <span className={`inline-flex rounded-full h-1.5 w-1.5 ${marketStatus.dot}`} />
              </div>
              <span className="text-[9px] text-ink-3 font-mono">
                {status?.last_sync ? `更新 ${status.last_sync}` : '同步中...'}
              </span>
            </div>
            <ThemeToggle />
            <button
              onClick={() => setMobileOpen(o => !o)}
              className="p-2 rounded-lg text-ink-2 hover:text-ink-1 hover:bg-overlay transition-colors"
            >
              {mobileOpen ? <X size={18} /> : <Menu size={18} />}
            </button>
          </div>
        </div>
      </div>

      {/* Mobile drawer */}
      <div className={`lg:hidden overflow-hidden transition-all duration-300 ${mobileOpen ? 'max-h-screen' : 'max-h-0'}`}>
        <div className="border-t border-line bg-panel px-4 pt-3 pb-6 space-y-1">
          <form onSubmit={handleSearch} className="relative mb-3">
            <input
              type="text"
              placeholder="代號或名稱..."
              value={query}
              onChange={e => setQuery(e.target.value)}
              className="w-full bg-overlay border border-line rounded-xl py-2.5 pl-9 pr-4 text-sm text-ink-1 placeholder:text-ink-3 focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand"
            />
            <Search className="absolute left-3 top-3 text-ink-3" size={15} />
          </form>

          {NAV_LINKS.map(({ path, label, icon: Icon }) => (
            <Link
              key={path}
              to={path}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors ${
                isActive(path) ? 'bg-brand-muted text-brand' : 'text-ink-2 hover:bg-overlay hover:text-ink-1'
              }`}
            >
              <Icon size={16} />
              {label}
            </Link>
          ))}

          <div className="pt-2 pb-1">
            <p className="px-3 mb-1 text-[10px] font-semibold text-ink-3 uppercase tracking-widest">策略選股</p>
            {STRATEGIES.map(({ path, label }) => (
              <Link
                key={path}
                to={path}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition-colors ${
                  location.pathname === path ? 'bg-brand-muted text-brand font-medium' : 'text-ink-2 hover:bg-overlay hover:text-ink-1'
                }`}
              >
                <BarChart2 size={15} className="opacity-50" />
                {label}
              </Link>
            ))}
          </div>
        </div>
      </div>
    </nav>
  );
});

Navbar.displayName = 'Navbar';
export default Navbar;
