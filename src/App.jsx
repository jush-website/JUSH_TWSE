import React, { useState, Suspense } from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { ThemeProvider } from './context/ThemeContext';
import { FontSizeProvider } from './context/FontSizeContext';
import { usePolling } from './hooks/usePolling';
import Navbar from './components/Navbar';
import { getShortTermRecommendations } from './services/api';

// 路由級 code splitting（美化.md 2-5）：首包只留首頁，其餘頁面用到才載
const Dashboard = React.lazy(() => import('./pages/Dashboard'));
const RecommendationPage = React.lazy(() => import('./pages/RecommendationPage'));
const StockAnalysis = React.lazy(() => import('./pages/StockAnalysis'));
const CapitalFlow = React.lazy(() => import('./pages/CapitalFlow'));
const MacroDashboard = React.lazy(() => import('./pages/MacroDashboard'));
const Derivatives = React.lazy(() => import('./pages/Derivatives'));

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }
  static getDerivedStateFromError(error) { return { hasError: true, error }; }
  componentDidCatch(error, errorInfo) {
    this.setState({ errorInfo });
    console.error('App Error:', error, errorInfo);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-canvas flex flex-col items-center justify-center p-4">
          <div className="w-full max-w-2xl card p-6">
            <h1 className="text-xl font-bold text-bull mb-3">系統出現錯誤</h1>
            <p className="text-ink-2 mb-4 text-sm">很抱歉，發生了未預期的錯誤。</p>
            <div className="bg-overlay rounded-lg p-4 text-sm font-mono text-bull mb-5 overflow-x-auto">
              <p className="font-semibold">{this.state.error?.toString()}</p>
              <pre className="mt-2 text-xs text-ink-3 whitespace-pre-wrap">
                {this.state.errorInfo?.componentStack}
              </pre>
            </div>
            <button
              onClick={() => window.location.reload()}
              className="bg-brand text-brand-fg px-5 py-2 rounded-lg text-sm font-semibold hover:opacity-90 transition-opacity"
            >
              重新整理頁面
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

function App() {
  const [status, setStatus] = useState(null);

  // 導覽列的「最後同步時間」。usePolling 會在分頁隱藏時停掉，
  // 避免使用者把分頁丟在背景時仍持續累積 Firestore 讀取。
  const fetchStatus = async () => {
    try {
      const res = await getShortTermRecommendations();
      if (res.updated_at) setStatus({ last_sync: res.updated_at });
    } catch (err) {
      // 同步時間只是輔助資訊，抓不到就維持原值，不影響頁面其他內容
      console.warn('取得最後同步時間失敗', err);
    }
  };

  usePolling(fetchStatus, 60000);

  return (
    <ThemeProvider>
      <FontSizeProvider>
      <ErrorBoundary>
        <Router>
          <div className="min-h-screen bg-canvas text-ink-1 font-sans">
            {/* 進場動畫改用 CSS keyframes（見 index.css 的 .intro-*）：
                同樣的滑入效果不必為此把 gsap 拉進首包，也自動尊重 prefers-reduced-motion。 */}
            <Navbar status={status} className="intro-slide-down" />
            <main className="container mx-auto px-3 sm:px-4 py-4 sm:py-6 max-w-7xl intro-slide-up">
              <Suspense fallback={
                <div className="text-center py-20 text-ink-3 text-sm">載入中...</div>
              }>
                <Routes>
                  <Route path="/"                       element={<Dashboard />} />
                  <Route path="/recommendations/:type"  element={<RecommendationPage />} />
                  <Route path="/capital-flow"           element={<CapitalFlow />} />
                  <Route path="/analyze"                element={<StockAnalysis />} />
                  <Route path="/analyze/:query"         element={<StockAnalysis />} />
                  <Route path="/macro"                  element={<MacroDashboard />} />
                  <Route path="/derivatives"            element={<Derivatives />} />
                </Routes>
              </Suspense>
            </main>
          </div>
        </Router>
      </ErrorBoundary>
      </FontSizeProvider>
    </ThemeProvider>
  );
}

export default App;
