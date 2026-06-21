import React from 'react';
import { useNavigate } from 'react-router-dom';
import { TrendingUp, TrendingDown, Zap, ArrowRight } from 'lucide-react';

const ScoreRing = ({ score }) => {
  const r = 18;
  const circ = 2 * Math.PI * r;
  const fill = circ - (circ * Math.min(score, 100)) / 100;
  const color = score >= 70 ? '#ef4444' : score >= 50 ? '#f97316' : '#6b7280';
  return (
    <svg width="48" height="48" viewBox="0 0 48 48" className="shrink-0">
      <circle cx="24" cy="24" r={r} fill="none" stroke="#1f2937" strokeWidth="4" />
      <circle
        cx="24" cy="24" r={r} fill="none"
        stroke={color} strokeWidth="4" strokeLinecap="round"
        strokeDasharray={circ} strokeDashoffset={fill}
        transform="rotate(-90 24 24)"
        style={{ transition: 'stroke-dashoffset 0.8s ease' }}
      />
      <text x="24" y="28" textAnchor="middle" fontSize="11" fontWeight="700" fill={color}>{score}</text>
    </svg>
  );
};

const StockCard = ({ stock, type }) => {
  const navigate = useNavigate();

  let score = stock.total_score || 0;
  let status = stock.recommend_status || 'N/A';
  let subText = '';
  let signals = [];

  if (type === 'overnight') {
    score = stock.overnight?.score || 0;
    status = stock.overnight?.status || 'N/A';
    signals = stock.overnight?.signals || [];
    subText = stock.overnight?.broker_ratio != null ? `隔日沖佔比 ${stock.overnight.broker_ratio}%` : '';
  } else if (type === 'bottom') {
    score = stock.bottom_fishing_rec?.score || 0;
    status = stock.bottom_fishing_rec?.status || 'N/A';
    signals = stock.bottom_fishing_rec?.signals || [];
  } else if (type === 'burst') {
    score = stock.short_term_burst_rec?.score || 0;
    status = stock.short_term_burst_rec?.status || 'N/A';
    signals = stock.short_term_burst_rec?.signals || [];
  } else if (type === 'short-term') {
    score = stock.short_term_rec?.score || 0;
    status = stock.short_term_rec?.status || 'N/A';
    signals = stock.short_term_rec?.signals || [];
  } else if (type === 'long-term') {
    signals = stock.low_pe_rec?.signals || [];
  } else if (type === 'cdp') {
    score = stock.total_score || 0;
    status = stock.cdp?.is_preview ? '明日預覽' : '今日即時';
  } else if (type === 'day-trade-cdp') {
    score = stock.day_trade_cdp_rec?.score || 0;
    status = stock.day_trade_cdp_rec?.status || 'N/A';
    signals = stock.day_trade_cdp_rec?.signals || [];
    subText = stock.day_trade_cdp_rec?.amplitude ? `前日波幅 ${stock.day_trade_cdp_rec.amplitude}%` : '';
  }

  const cdp = stock.cdp;
  const showCdp = cdp && cdp.CDP;
  const isPositive = (stock.change_percent ?? 0) >= 0;
  const volRatio = stock.vol_ratio ?? 0;

  const trendBorder = isPositive ? 'hover:border-red-500/40' : 'hover:border-green-500/40';
  const trendGlow = isPositive
    ? 'hover:shadow-[0_0_20px_rgba(239,68,68,0.15)]'
    : 'hover:shadow-[0_0_20px_rgba(34,197,94,0.15)]';

  return (
    <div
      onClick={() => navigate(`/analyze/${stock.stock_id}`)}
      className={`gsap-recommend-card group relative bg-gray-800/70 backdrop-blur-xl rounded-2xl border border-gray-700/50 p-4 cursor-pointer transition-all duration-300 ${trendBorder} ${trendGlow} hover:-translate-y-0.5`}
    >
      {/* Subtle gradient overlay on hover */}
      <div className={`absolute inset-0 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none ${isPositive ? 'bg-gradient-to-br from-red-900/10 to-transparent' : 'bg-gradient-to-br from-green-900/10 to-transparent'}`} />

      {/* Header */}
      <div className="flex items-start justify-between mb-3 relative">
        <div className="min-w-0">
          <h3 className="font-bold text-base text-white group-hover:text-blue-300 transition-colors truncate leading-tight">
            {stock.stock_name}
          </h3>
          <div className="flex items-center gap-1.5 mt-0.5">
            <span className="text-xs text-gray-500 font-mono">{stock.stock_id}</span>
            {status && status !== 'N/A' && (
              <span className="text-[10px] bg-blue-900/50 text-blue-300 border border-blue-800/50 px-1.5 py-0.5 rounded-full font-medium">
                {status}
              </span>
            )}
          </div>
        </div>
        <ScoreRing score={score} />
      </div>

      {/* Price row */}
      <div className="flex items-end justify-between mb-3 relative">
        <div>
          <div className="text-2xl font-black tracking-tight">{stock.price ?? '--'}</div>
          <div className={`flex items-center gap-1 text-sm font-semibold mt-0.5 ${isPositive ? 'text-red-400' : 'text-green-400'}`}>
            {isPositive ? <TrendingUp size={13} /> : <TrendingDown size={13} />}
            {isPositive ? '+' : ''}{stock.change_percent ?? 0}%
          </div>
        </div>
        {/* Volume ratio badge */}
        {!showCdp && volRatio > 0 && (
          <div className={`text-right text-xs px-2 py-1 rounded-lg border ${volRatio > 2 ? 'bg-orange-900/30 text-orange-300 border-orange-800/50' : volRatio > 1.5 ? 'bg-yellow-900/30 text-yellow-300 border-yellow-800/50' : 'bg-gray-700/30 text-gray-400 border-gray-700/50'}`}>
            <div className="text-[10px] text-gray-500 mb-0.5">量比</div>
            <div className="font-bold">{volRatio}x</div>
          </div>
        )}
      </div>

      {/* Signals */}
      {signals.length > 0 && (
        <div className="mb-2 relative">
          <div className="flex items-center gap-1 mb-1.5">
            <Zap size={10} className="text-yellow-400" />
            <span className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">訊號</span>
          </div>
          <div className="flex flex-wrap gap-1">
            {signals.slice(0, 3).map((sig, i) => {
              const isHold = sig.includes('一夜持股');
              return (
                <span key={i} className={`text-[10px] px-1.5 py-0.5 rounded border ${isHold ? 'bg-yellow-900/40 text-yellow-300 border-yellow-700/50 font-bold' : 'bg-gray-700/40 text-gray-300 border-gray-600/50'}`}>
                  {sig}
                </span>
              );
            })}
            {signals.length > 3 && (
              <span className="text-[10px] text-gray-600">+{signals.length - 3}</span>
            )}
          </div>
        </div>
      )}

      {/* Volume patterns */}
      {stock.volume_patterns?.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-2 relative">
          {stock.volume_patterns.map((vp, i) => {
            const cls = vp.status === 'positive'
              ? 'bg-red-900/30 text-red-300 border-red-800/40'
              : vp.status === 'negative'
              ? 'bg-green-900/30 text-green-300 border-green-800/40'
              : 'bg-gray-700/30 text-gray-400 border-gray-700/40';
            return (
              <span key={i} className={`text-[10px] px-1.5 py-0.5 rounded border ${cls}`} title={vp.desc}>
                {vp.pattern}
              </span>
            );
          })}
        </div>
      )}

      {/* CDP data */}
      {showCdp && (
        <div className="mt-2 bg-gray-900/60 rounded-xl border border-gray-700/50 p-2.5 relative">
          <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
            {[['AH', cdp.AH, 'text-red-400'], ['NL', cdp.NL, 'text-blue-400'], ['NH', cdp.NH, 'text-red-300'], ['AL', cdp.AL, 'text-blue-500']].map(([k, v, c]) => (
              <div key={k} className="flex justify-between items-center">
                <span className={`font-bold ${c}`}>{k}</span>
                <span className="text-gray-200 font-mono">{v}</span>
              </div>
            ))}
          </div>
          <div className="flex items-center justify-center gap-2 mt-2 pt-2 border-t border-gray-700/50 text-xs">
            <span className="text-purple-400 font-bold">CDP</span>
            <span className="text-white font-black font-mono">{cdp.CDP}</span>
          </div>
        </div>
      )}

      {/* Misc data row */}
      {!showCdp && (subText || stock.strategy_name) && (
        <div className="border-t border-gray-700/40 pt-2 mt-2 relative">
          {subText && (
            <div className="flex justify-between text-xs mb-0.5">
              <span className="text-gray-500">關鍵</span>
              <span className="text-blue-300 font-medium">{subText}</span>
            </div>
          )}
          {stock.strategy_name && (
            <div className="flex justify-between text-xs">
              <span className="text-gray-500">策略</span>
              <span className="text-gray-300 truncate ml-2 max-w-[60%]">{stock.strategy_name}</span>
            </div>
          )}
        </div>
      )}

      {/* Footer CTA */}
      <div className="mt-3 flex items-center justify-end gap-1 text-[10px] text-gray-600 group-hover:text-blue-400/70 transition-colors relative">
        <span>查看詳細分析</span>
        <ArrowRight size={10} className="group-hover:translate-x-0.5 transition-transform" />
      </div>
    </div>
  );
};

export default StockCard;
