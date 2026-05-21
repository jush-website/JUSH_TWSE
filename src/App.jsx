import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import Navbar from './components/Navbar';
import Dashboard from './pages/Dashboard';
import RecommendationPage from './pages/RecommendationPage';
import StockAnalysis from './pages/StockAnalysis';
import { getStatus } from './services/api';

function App() {
  const [status, setStatus] = useState(null);
  const [lastUpdated, setLastUpdated] = useState(null);

  useEffect(() => {
    const fetchStatus = async () => {
      try {
        const res = await getStatus();
        setStatus(res.data);
        // 記錄前端成功拿到資料的当下時間
        const now = new Date();
        const pad = (n) => String(n).padStart(2, '0');
        setLastUpdated(
          `${now.getFullYear()}-${pad(now.getMonth()+1)}-${pad(now.getDate())} ` +
          `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`
        );
      } catch (err) {
        console.error('Failed to fetch status', err);
      }
    };
    fetchStatus();
    // 每 3 分鐘自動更新
    const interval = setInterval(fetchStatus, 3 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  return (
    <Router>
      <div className="min-h-screen bg-gray-900 text-white font-sans">
        <Navbar status={status} lastUpdated={lastUpdated} />
        <main className="container mx-auto px-2 sm:px-4 py-4 sm:py-6">
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/recommendations/:type" element={<RecommendationPage />} />
            <Route path="/analyze" element={<StockAnalysis />} />
            <Route path="/analyze/:query" element={<StockAnalysis />} />
          </Routes>
        </main>
      </div>
    </Router>
  );
}

export default App;
