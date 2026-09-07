import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

const SIZES = ['sm', 'md', 'lg'];
const SCALE = { sm: 0.92, md: 1, lg: 1.12 };

const FontSizeContext = createContext({
  size: 'md',
  setSize: () => {},
  cycle: () => {},
});

export function FontSizeProvider({ children }) {
  const [size, setSize] = useState(() => {
    // index.html 的 inline script 已在首次繪製前套好字級，這裡讀回同一份結論。
    const applied = document.documentElement.dataset.fontSize;
    return SIZES.includes(applied) ? applied : 'md';
  });

  useEffect(() => {
    const root = document.documentElement;
    root.dataset.fontSize = size;
    // Scale the base rem only — Tailwind breakpoints use px, so RWD is untouched.
    root.style.fontSize = `${SCALE[size] * 100}%`;
    localStorage.setItem('fontSize', size);
  }, [size]);

  const cycle = useCallback(() => {
    setSize(prev => SIZES[(SIZES.indexOf(prev) + 1) % SIZES.length]);
  }, []);

  // 同 ThemeContext：固定 value 的參考，避免無謂的下游重繪。
  const value = useMemo(() => ({ size, setSize, cycle }), [size, cycle]);

  return (
    <FontSizeContext.Provider value={value}>
      {children}
    </FontSizeContext.Provider>
  );
}

// Provider 與其存取 hook 放同一檔案是刻意的；拆開只是為了 fast refresh，
// 卻會讓所有使用端多一個 import。
// eslint-disable-next-line react-refresh/only-export-components
export const useFontSize = () => useContext(FontSizeContext);
