import React from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { Zap, Moon, Rocket, Anchor, Diamond } from 'lucide-react';

const StrategySubNav = () => {
  const location = useLocation();
  
  // 只有在首頁或推薦頁面顯示，或者全站顯示也可。這裡設定為全站顯示，確保最外層隨時可見。
  const strategies = [
    { id: 'short-term', name: '短線極佳', icon: <Zap size={16} />, color: 'text-blue-400', activeBg: 'bg-blue-500/20' },
    { id: 'overnight', name: '隔日沖動能', icon: <Moon size={16} />, color: 'text-purple-400', activeBg: 'bg-purple-500/20' },
    { id: 'burst', name: '強勢爆發', icon: <Rocket size={16} />, color: 'text-orange-400', activeBg: 'bg-orange-500/20' },
    { id: 'bottom', name: '抄底絕佳', icon: <Anchor size={16} />, color: 'text-emerald-400', activeBg: 'bg-emerald-500/20' },
    { id: 'long-term', name: '長期精選', icon: <Diamond size={16} />, color: 'text-indigo-400', activeBg: 'bg-indigo-500/20' }
  ];

  return (
    <div className="bg-gray-800/80 backdrop-blur-md border-b border-gray-700 sticky top-[57px] sm:top-[65px] z-40 overflow-x-auto no-scrollbar">
      <div className="container mx-auto px-2 sm:px-4 flex items-center min-w-max py-2 gap-2 sm:gap-4">
        <span className="text-xs sm:text-sm font-semibold text-gray-400 mr-2 uppercase tracking-widest hidden sm:block">策略導覽</span>
        {strategies.map((s) => {
          const isActive = location.pathname === `/recommendations/${s.id}`;
          return (
            <NavLink
              key={s.id}
              to={`/recommendations/${s.id}`}
              className={`flex items-center space-x-1.5 px-3 py-1.5 sm:px-4 sm:py-2 rounded-full transition-all duration-200 border ${
                isActive 
                  ? `border-${s.color.split('-')[1]}-500/50 ${s.activeBg} ${s.color}` 
                  : 'border-transparent text-gray-400 hover:text-gray-200 hover:bg-gray-700'
              }`}
            >
              <span className={isActive ? s.color : 'text-gray-500'}>{s.icon}</span>
              <span className="text-xs sm:text-sm font-medium whitespace-nowrap">{s.name}</span>
            </NavLink>
          );
        })}
      </div>
    </div>
  );
};

export default StrategySubNav;
