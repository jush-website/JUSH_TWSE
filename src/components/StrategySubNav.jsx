import React from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { Zap, Moon, Rocket, Anchor, Diamond } from 'lucide-react';

const StrategySubNav = () => {
  const location = useLocation();

  const strategies = [
    { id: 'short-term',  name: '短線極佳',   icon: <Zap size={14} /> },
    { id: 'overnight',   name: '隔日沖動能', icon: <Moon size={14} /> },
    { id: 'burst',       name: '強勢爆發',   icon: <Rocket size={14} /> },
    { id: 'bottom',      name: '抄底絕佳',   icon: <Anchor size={14} /> },
    { id: 'long-term',   name: '長期精選',   icon: <Diamond size={14} /> },
  ];

  return (
    <div className="bg-panel border-b border-line sticky top-[57px] sm:top-[65px] z-40 overflow-x-auto no-scrollbar">
      <div className="container mx-auto px-3 sm:px-4 flex items-center min-w-max py-1.5 gap-1">
        <span className="text-xs text-ink-3 mr-2 uppercase tracking-wider hidden sm:block">策略</span>
        {strategies.map(s => {
          const isActive = location.pathname === `/recommendations/${s.id}`;
          return (
            <NavLink
              key={s.id}
              to={`/recommendations/${s.id}`}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-all text-xs font-medium whitespace-nowrap ${
                isActive
                  ? 'bg-brand-muted text-brand'
                  : 'text-ink-2 hover:bg-overlay hover:text-ink-1'
              }`}
            >
              <span>{s.icon}</span>
              <span>{s.name}</span>
            </NavLink>
          );
        })}
      </div>
    </div>
  );
};

export default StrategySubNav;
