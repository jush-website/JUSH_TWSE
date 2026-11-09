import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { prefetchRouteData } from './services/api'

// Vite 預先載入（modulepreload）的分包在重新部署後不存在時會發這個事件，
// 跟 App.jsx 的 lazyWithReload 一樣重新整理一次拿新版，10 秒內不重複。
window.addEventListener('vite:preloadError', (event) => {
  let last = 0
  try { last = Number(sessionStorage.getItem('chunk-reload-at')) || 0 } catch { /* ignore */ }
  if (Date.now() - last > 10000) {
    event.preventDefault()
    try { sessionStorage.setItem('chunk-reload-at', String(Date.now())) } catch { /* ignore */ }
    window.location.reload()
  }
})

// 先把這一頁要的資料請求發出去，再掛載 React（見 prefetchRouteData 的說明）
prefetchRouteData(window.location.pathname)

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
