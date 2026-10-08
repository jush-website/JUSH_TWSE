import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { prefetchRouteData } from './services/api'

// 先把這一頁要的資料請求發出去，再掛載 React（見 prefetchRouteData 的說明）
prefetchRouteData(window.location.pathname)

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
