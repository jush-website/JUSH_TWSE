import React from 'react';
import { Type } from 'lucide-react';
import { useFontSize } from '../context/FontSizeContext';

const LABEL = { sm: '小', md: '中', lg: '大' };

export default function FontSizeToggle({ className = '' }) {
  const { size, cycle } = useFontSize();
  return (
    <button
      onClick={cycle}
      className={`relative p-2 rounded-lg text-ink-2 hover:text-ink-1 hover:bg-overlay transition-colors duration-150 ${className}`}
      aria-label={`調整字體大小（目前：${LABEL[size]}）`}
      title={`字體：${LABEL[size]}`}
    >
      <Type size={16} strokeWidth={1.75} />
      <span className="absolute -bottom-0.5 -right-0.5 text-[9px] font-bold text-brand bg-panel border border-line rounded-full w-3.5 h-3.5 flex items-center justify-center leading-none">
        {LABEL[size]}
      </span>
    </button>
  );
}
