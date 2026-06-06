import React, { useState, useEffect, Suspense } from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import Navbar from './components/Navbar';
import Dashboard from './pages/Dashboard';
import RecommendationPage from './pages/RecommendationPage';
import StockAnalysis from './pages/StockAnalysis';
import CapitalFlow from './pages/CapitalFlow';
import TwinkleData from './pages/TwinkleData';
import { getShortTermRecommendations } from './services/api';

// 簡易錯誤邊界組件
class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError(error) { return { hasError: true }; }
  componentDidCatch(error, errorInfo) { console.error("App Error:", error, errorInfo); }
  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-gray-900 flex items-center justify-center text-white p-4 text-center">
          <div>
            <h1 className="text-2xl font-bold mb-4">系統出現錯誤</h1>
            <p className="text-gray-400 mb-6">請嘗試重新整理頁面，或檢查網路連線。</p>
            <button onClick={() => window.location.reload()} className="bg-blue-600 hover:bg-blue-700 px-6 py-2 rounded-lg transition">
              重新整理
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

  return (
    <ErrorBoundary>
      <Router>
        <div className="min-h-screen bg-gray-900 text-white font-sans">
          <Navbar status={status} />
          <main className="container mx-auto px-4 py-6">
            <Suspense fallback={<div className="text-center py-20 text-gray-400">載入組件中...</div>}>
              <Routes>
                <Route path="/" element={<Dashboard />} />
                <Route path="/recommendations/:type" element={<RecommendationPage />} />
                <Route path="/capital-flow" element={<CapitalFlow />} />
                <Route path="/twinkle" element={<TwinkleData />} />
                <Route path="/analyze" element={<StockAnalysis />} />
                <Route path="/analyze/:query" element={<StockAnalysis />} />
              </Routes>
            </Suspense>
          </main>
        </div>
      </Router>
    </ErrorBoundary>
  );
}

export default App;
