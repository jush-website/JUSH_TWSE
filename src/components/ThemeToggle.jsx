import React from 'react';
import { Sun, Moon } from 'lucide-react';
import { useTheme } from '../context/ThemeContext';

export default function ThemeToggle({ className = '' }) {
  const { dark, toggle } = useTheme();
  return (
    <button
      onClick={toggle}
      className={`p-2 rounded-lg text-ink-2 hover:text-ink-1 hover:bg-overlay transition-colors duration-150 ${className}`}
      aria-label={dark ? '切換亮色模式' : '切換暗色模式'}
    >
      {dark
        ? <Sun size={16} strokeWidth={1.75} />
        : <Moon size={16} strokeWidth={1.75} />
      }
    </button>
  );
}
