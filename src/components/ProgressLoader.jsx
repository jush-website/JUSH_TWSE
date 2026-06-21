import React, { useState, useEffect } from 'react';

const ProgressLoader = ({ text = '載入中...' }) => {
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setProgress(prev => {
        if (prev >= 95) return prev;
        return Math.min(prev + Math.random() * ((100 - prev) / 10), 95);
      });
    }, 150);
    return () => clearInterval(timer);
  }, []);

  return (
    <div className="flex flex-col items-center justify-center py-32 w-full max-w-sm mx-auto select-none">
      {/* Animated dot + label */}
      <div className="flex items-center gap-2.5 mb-8">
        <span className="relative flex h-2 w-2">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75" />
          <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-500" />
        </span>
        <span className="text-xs font-semibold text-gray-400 tracking-widest uppercase">{text}</span>
      </div>

      {/* Track */}
      <div className="w-full h-[3px] bg-gray-800 rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-300 ease-out relative"
          style={{
            width: `${progress}%`,
            background: 'linear-gradient(90deg, #3b82f6, #06b6d4)',
          }}
        >
          <div className="absolute right-0 top-0 bottom-0 w-12 bg-gradient-to-r from-transparent to-white/40 blur-sm" />
        </div>
      </div>

      <div className="mt-3 w-full flex justify-end">
        <span className="text-[10px] font-mono text-blue-500/60">{Math.round(progress)}%</span>
      </div>
    </div>
  );
};

export default ProgressLoader;
