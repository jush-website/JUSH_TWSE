import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

const ThemeContext = createContext({ dark: true, toggle: () => {} });

export function ThemeProvider({ children }) {
  const [dark, setDark] = useState(() => {
    // index.html 的 inline script 在首次繪製前就套好了 class，
    // 這裡直接讀回它的結論，避免兩邊算出不同答案而閃一下。
    return document.documentElement.classList.contains('dark');
  });

  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle('dark', dark);
    localStorage.setItem('theme', dark ? 'dark' : 'light');
  }, [dark]);

  const toggle = useCallback(() => setDark(d => !d), []);

  // 沒有 useMemo 的話，每次 App 重繪都會產生新的 value 物件，
  // 讓所有 useTheme() 的元件跟著白重繪一次。
  const value = useMemo(() => ({ dark, toggle }), [dark, toggle]);

  return (
    <ThemeContext.Provider value={value}>
      {children}
    </ThemeContext.Provider>
  );
}

// Provider 與其存取 hook 放同一檔案是刻意的；拆開只是為了 fast refresh，
// 卻會讓所有使用端多一個 import。
// eslint-disable-next-line react-refresh/only-export-components
export const useTheme = () => useContext(ThemeContext);
