import React, { useState, useEffect } from 'react';

const ProgressLoader = ({ text = "載入中..." }) => {
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    // 模擬進度條增長
    const timer = setInterval(() => {
      setProgress((prev) => {
        if (prev >= 95) return prev; // 最多卡在 95%，直到真正載入完成
        // 隨著進度增加，速度變慢
        const remaining = 100 - prev;
        const step = Math.random() * (remaining / 10);
        return Math.min(prev + step, 95);
      });
    }, 150);

    return () => clearInterval(timer);
  }, []);

  return (
    <div className="flex flex-col items-center justify-center py-32 w-full max-w-md mx-auto">
      <div className="text-cyan-400 font-semibold mb-6 text-sm tracking-widest uppercase flex items-center space-x-3">
        <div className="w-2.5 h-2.5 rounded-full bg-cyan-400 animate-pulse shadow-[0_0_8px_rgba(34,211,238,0.8)]"></div>
        <span>{text}</span>
      </div>
      
      <div className="w-full bg-gray-800/80 rounded-full h-2 mb-3 overflow-hidden border border-white/5 shadow-inner">
        <div 
          className="bg-gradient-to-r from-blue-500 via-cyan-400 to-emerald-400 h-full rounded-full transition-all duration-300 ease-out relative"
          style={{ width: `${progress}%` }}
        >
          {/* 光暈特效 */}
          <div className="absolute top-0 right-0 bottom-0 w-20 bg-gradient-to-r from-transparent to-white/30 blur-[2px]"></div>
        </div>
      </div>
      
      <div className="flex justify-between w-full text-xs text-gray-500 font-mono px-1">
        <span>Initializing...</span>
        <span className="text-cyan-500/70">{Math.round(progress)}%</span>
      </div>
    </div>
  );
};

export default ProgressLoader;
