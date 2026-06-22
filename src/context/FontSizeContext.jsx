import React, { createContext, useContext, useState, useEffect } from 'react';

const SIZES = ['sm', 'md', 'lg'];
const SCALE = { sm: 0.92, md: 1, lg: 1.12 };

const FontSizeContext = createContext({
  size: 'md',
  setSize: () => {},
  cycle: () => {},
});

export function FontSizeProvider({ children }) {
  const [size, setSize] = useState(() => {
    const saved = localStorage.getItem('fontSize');
    return SIZES.includes(saved) ? saved : 'md';
  });

  useEffect(() => {
    const root = document.documentElement;
    root.dataset.fontSize = size;
    // Scale the base rem only — Tailwind breakpoints use px, so RWD is untouched.
    root.style.fontSize = `${SCALE[size] * 100}%`;
    localStorage.setItem('fontSize', size);
  }, [size]);

  const cycle = () => {
    setSize(prev => SIZES[(SIZES.indexOf(prev) + 1) % SIZES.length]);
  };

  return (
    <FontSizeContext.Provider value={{ size, setSize, cycle }}>
      {children}
    </FontSizeContext.Provider>
  );
}

export const useFontSize = () => useContext(FontSizeContext);
