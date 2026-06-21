import React, { useState, useEffect, Suspense } from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import gsap from 'gsap';
import { useGSAP } from '@gsap/react';
import { ThemeProvider } from './context/ThemeContext';
import Navbar from './components/Navbar';
import Dashboard from './pages/Dashboard';
import RecommendationPage from './pages/RecommendationPage';
import StockAnalysis from './pages/StockAnalysis';
import CapitalFlow from './pages/CapitalFlow';
import MacroDashboard from './pages/MacroDashboard';
import Derivatives from './pages/Derivatives';
import { getShortTermRecommendations } from './services/api';

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
  const appRef  = React.useRef(null);
  const navRef  = React.useRef(null);
  const mainRef = React.useRef(null);

  useEffect(() => {
    const fetchStatus = async () => {
      try {
        const res = await getShortTermRecommendations();
        if (res.updated_at) setStatus({ last_sync: res.updated_at });
      } catch {}
    };
    fetchStatus();
    const id = setInterval(fetchStatus, 60000);
    return () => clearInterval(id);
  }, []);

  useGSAP(() => {
    gsap.from(appRef.current,  { opacity: 0, duration: 0.6, ease: 'power2.out' });
    gsap.from(navRef.current,  { y: -40, opacity: 0, duration: 0.7, ease: 'back.out(1.5)', delay: 0.1 });
    gsap.from(mainRef.current, { y: 20,  opacity: 0, duration: 0.7, ease: 'power3.out',   delay: 0.25 });
  }, { scope: appRef, dependencies: [] });

  return (
    <ThemeProvider>
      <ErrorBoundary>
        <Router>
          <div ref={appRef} className="min-h-screen bg-canvas text-ink-1 font-sans">
            <Navbar ref={navRef} status={status} />
            <main ref={mainRef} className="container mx-auto px-4 py-6 max-w-7xl">
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
    </ThemeProvider>
  );
}

export default App;
