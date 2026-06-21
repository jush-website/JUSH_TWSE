import React, { useState, useEffect } from 'react';

const ProgressLoader = ({ text = '載入中...' }) => {
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const t = setInterval(() => {
      setProgress(p => p >= 95 ? p : Math.min(p + Math.random() * ((100 - p) / 10), 95));
    }, 150);
    return () => clearInterval(t);
  }, []);

  return (
    <div className="flex flex-col items-center justify-center py-28 w-full max-w-xs mx-auto select-none">
      <div className="flex items-center gap-2.5 mb-7">
        <span className="relative flex h-1.5 w-1.5">
          <span className="animate-ping absolute inset-0 rounded-full bg-brand opacity-60" />
          <span className="relative rounded-full h-1.5 w-1.5 bg-brand" />
        </span>
        <span className="text-xs text-ink-3 tracking-widest uppercase font-medium">{text}</span>
      </div>

      <div className="w-full h-[3px] bg-overlay rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-300 ease-out"
          style={{
            width: `${progress}%`,
            background: 'linear-gradient(90deg, hsl(var(--brand)), hsl(221 94% 75%))',
          }}
        />
      </div>

      <div className="mt-2.5 w-full flex justify-end">
        <span className="text-[10px] text-ink-3 font-mono nums">{Math.round(progress)}%</span>
      </div>
    </div>
  );
};

export default ProgressLoader;
