import React, { useState, useEffect, Suspense } from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import gsap from 'gsap';
import { useGSAP } from '@gsap/react';
import Navbar from './components/Navbar';
import Dashboard from './pages/Dashboard';
import RecommendationPage from './pages/RecommendationPage';
import StockAnalysis from './pages/StockAnalysis';
import CapitalFlow from './pages/CapitalFlow';
import MacroDashboard from './pages/MacroDashboard';
import Derivatives from './pages/Derivatives';
import { getShortTermRecommendations } from './services/api';

// 簡易錯誤邊界組件
class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }
  static getDerivedStateFromError(error) { return { hasError: true, error }; }
  componentDidCatch(error, errorInfo) { 
    this.setState({ errorInfo });
    console.error("App Error:", error, errorInfo); 
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-gray-900 flex flex-col items-center justify-center text-white p-4">
          <div className="w-full max-w-3xl bg-gray-800 p-6 rounded-2xl border border-red-500/50 shadow-2xl">
            <h1 className="text-2xl font-bold text-red-400 mb-4">系統出現錯誤</h1>
            <p className="text-gray-300 mb-4">很抱歉，發生了未預期的錯誤。</p>
            
            <div className="bg-black/50 p-4 rounded-lg overflow-x-auto text-left mb-6 text-sm font-mono text-red-300">
              <p className="font-bold">{this.state.error && this.state.error.toString()}</p>
              <pre className="mt-2 text-xs text-gray-400 whitespace-pre-wrap">{this.state.errorInfo && this.state.errorInfo.componentStack}</pre>
            </div>

            <button onClick={() => window.location.reload()} className="bg-blue-600 hover:bg-blue-700 px-6 py-2 rounded-lg transition font-bold shadow-lg">
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

  const appRef = React.useRef(null);
  const navRef = React.useRef(null);
  const mainRef = React.useRef(null);

  useEffect(() => {
    const fetchStatus = async () => {
      try {
        const res = await getShortTermRecommendations();
        if (res.updated_at) {
          setStatus({ last_sync: res.updated_at });
        }
      } catch (err) {
        console.error('Failed to fetch status', err);
      }
    };
    fetchStatus();
    const interval = setInterval(fetchStatus, 60000);
    return () => clearInterval(interval);
  }, []);

  useGSAP(() => {
    gsap.from(appRef.current, { opacity: 0, duration: 1, ease: "power2.out" });
    gsap.from(navRef.current, { y: -50, opacity: 0, duration: 0.8, ease: "back.out(1.7)", delay: 0.2 });
    gsap.from(mainRef.current, { y: 30, opacity: 0, duration: 0.8, ease: "power3.out", delay: 0.4 });
  }, { scope: appRef, dependencies: [] });

  return (
    <ErrorBoundary>
      <Router>
        <div ref={appRef} className="min-h-screen bg-gray-900 text-white font-sans">
          <Navbar ref={navRef} status={status} />
          <main ref={mainRef} className="container mx-auto px-4 py-6">
            <Suspense fallback={<div className="text-center py-20 text-gray-400">載入組件中...</div>}>
              <Routes>
                <Route path="/" element={<Dashboard />} />
                <Route path="/recommendations/:type" element={<RecommendationPage />} />
                <Route path="/capital-flow" element={<CapitalFlow />} />
                <Route path="/analyze" element={<StockAnalysis />} />
                <Route path="/analyze/:query" element={<StockAnalysis />} />
                <Route path="/macro" element={<MacroDashboard />} />
                <Route path="/derivatives" element={<Derivatives />} />
              </Routes>
            </Suspense>
          </main>
        </div>
      </Router>
    </ErrorBoundary>
  );
}

export default App;
