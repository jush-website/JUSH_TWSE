import React from 'react';
import { useNavigate } from 'react-router-dom';
import { TrendingUp, TrendingDown, Zap, ArrowRight } from 'lucide-react';

const ScoreRing = ({ score }) => {
  const r = 17;
  const circ = 2 * Math.PI * r;
  const offset = circ - (circ * Math.min(score, 100)) / 100;
  const color = score >= 70 ? 'hsl(var(--bull))' : score >= 50 ? '#f59e0b' : 'hsl(var(--ink-3))';
  return (
    <svg width="44" height="44" viewBox="0 0 44 44" className="shrink-0">
      <circle cx="22" cy="22" r={r} fill="none" stroke="hsl(var(--overlay))" strokeWidth="3.5" />
      <circle
        cx="22" cy="22" r={r} fill="none"
        stroke={color} strokeWidth="3.5" strokeLinecap="round"
        strokeDasharray={circ} strokeDashoffset={offset}
        transform="rotate(-90 22 22)"
        style={{ transition: 'stroke-dashoffset 0.8s ease' }}
      />
      <text x="22" y="26.5" textAnchor="middle" fontSize="10" fontWeight="700" fill={color}>
        {score}
      </text>
    </svg>
  );
};

const VolBadge = ({ ratio }) => {
  if (!ratio || ratio <= 0) return null;
  const tier = ratio > 2 ? { bg: 'bg-orange-100 dark:bg-orange-900/30', text: 'text-orange-700 dark:text-orange-300', border: 'border-orange-300 dark:border-orange-700/50' }
             : ratio > 1.5 ? { bg: 'bg-yellow-100 dark:bg-yellow-900/30', text: 'text-yellow-700 dark:text-yellow-300', border: 'border-yellow-300 dark:border-yellow-700/50' }
             : { bg: 'bg-overlay', text: 'text-ink-3', border: 'border-line' };
  return (
    <div className={`text-right text-[10px] px-2 py-1 rounded-lg border ${tier.bg} ${tier.text} ${tier.border}`}>
      <div className="text-ink-3 mb-0.5">量比</div>
      <div className="font-bold nums">{ratio}x</div>
    </div>
  );
};

const StockCard = ({ stock, type }) => {
  const navigate = useNavigate();

  let score = stock.total_score || 0;
  let status = stock.recommend_status || '';
  let subText = '';
  let signals = [];

  if (type === 'overnight') {
    score = stock.overnight?.score || 0;
    status = stock.overnight?.status || '';
    signals = stock.overnight?.signals || [];
    subText = stock.overnight?.broker_ratio != null ? `隔日沖佔比 ${stock.overnight.broker_ratio}%` : '';
  } else if (type === 'bottom') {
    score = stock.bottom_fishing_rec?.score || 0;
    status = stock.bottom_fishing_rec?.status || '';
    signals = stock.bottom_fishing_rec?.signals || [];
  } else if (type === 'burst') {
    score = stock.short_term_burst_rec?.score || 0;
    status = stock.short_term_burst_rec?.status || '';
    signals = stock.short_term_burst_rec?.signals || [];
  } else if (type === 'short-term') {
    score = stock.short_term_rec?.score || 0;
    status = stock.short_term_rec?.status || '';
    signals = stock.short_term_rec?.signals || [];
  } else if (type === 'long-term') {
    signals = stock.low_pe_rec?.signals || [];
  } else if (type === 'cdp') {
    score = stock.total_score || 0;
    status = stock.cdp?.is_preview ? '明日預覽' : '今日即時';
  } else if (type === 'day-trade-cdp') {
    score = stock.day_trade_cdp_rec?.score || 0;
    status = stock.day_trade_cdp_rec?.status || '';
    signals = stock.day_trade_cdp_rec?.signals || [];
    subText = stock.day_trade_cdp_rec?.amplitude ? `前日波幅 ${stock.day_trade_cdp_rec.amplitude}%` : '';
  }

  const cdp = stock.cdp;
  const showCdp = cdp?.CDP;
  const isUp = (stock.change_percent ?? 0) >= 0;
  const volRatio = stock.vol_ratio ?? 0;

  return (
    <div
      onClick={() => navigate(`/analyze/${stock.stock_id}`)}
      className="gsap-recommend-card group card p-4 cursor-pointer transition-all duration-200 hover:-translate-y-0.5 hover:shadow-card-md hover:border-brand/30"
    >
      {/* Header */}
      <div className="flex items-start justify-between mb-3">
        <div className="min-w-0 pr-2">
          <h3 className="font-semibold text-sm text-ink-1 group-hover:text-brand transition-colors truncate leading-tight">
            {stock.stock_name}
          </h3>
          <div className="flex items-center gap-1.5 mt-0.5">
            <span className="text-[10px] text-ink-3 font-mono">{stock.stock_id}</span>
            {status && (
              <span className="text-[10px] bg-brand-muted text-brand border border-brand/20 px-1.5 py-0.5 rounded-full">
                {status}
              </span>
            )}
          </div>
        </div>
        <ScoreRing score={score} />
      </div>

      {/* Price */}
      <div className="flex items-end justify-between mb-3">
        <div>
          <div className="text-xl font-bold text-ink-1 nums">{stock.price ?? '--'}</div>
          <div className={`flex items-center gap-0.5 text-xs font-semibold mt-0.5 nums ${isUp ? 'text-bull' : 'text-bear'}`}>
            {isUp ? <TrendingUp size={11} /> : <TrendingDown size={11} />}
            {isUp ? '+' : ''}{stock.change_percent ?? 0}%
          </div>
        </div>
        {!showCdp && <VolBadge ratio={volRatio} />}
      </div>

      {/* Signals */}
      {signals.length > 0 && (
        <div className="mb-2.5">
          <div className="flex items-center gap-1 mb-1.5">
            <Zap size={10} className="text-yellow-500" />
            <span className="text-[9px] font-semibold text-ink-3 uppercase tracking-wider">訊號</span>
          </div>
          <div className="flex flex-wrap gap-1">
            {signals.slice(0, 3).map((sig, i) => {
              const hold = sig.includes('一夜持股');
              return (
                <span
                  key={i}
                  className={`text-[10px] px-1.5 py-0.5 rounded border ${
                    hold
                      ? 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-300 border-yellow-300 dark:border-yellow-700/40 font-bold'
                      : 'bg-overlay text-ink-2 border-line'
                  }`}
                >
                  {sig}
                </span>
              );
            })}
            {signals.length > 3 && (
              <span className="text-[10px] text-ink-3">+{signals.length - 3}</span>
            )}
          </div>
        </div>
      )}

      {/* Volume patterns */}
      {stock.volume_patterns?.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-2.5">
          {stock.volume_patterns.map((vp, i) => {
            const cls = vp.status === 'positive'
              ? 'bg-bull-muted text-bull border-bull/20'
              : vp.status === 'negative'
              ? 'bg-bear-muted text-bear border-bear/20'
              : 'bg-overlay text-ink-3 border-line';
            return (
              <span key={i} className={`text-[10px] px-1.5 py-0.5 rounded border ${cls}`} title={vp.desc}>
                {vp.pattern}
              </span>
            );
          })}
        </div>
      )}

      {/* CDP */}
      {showCdp && (
        <div className="mt-1 bg-overlay rounded-lg border border-line p-2.5">
          <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
            {[['AH', cdp.AH, 'text-bull'], ['NL', cdp.NL, 'text-brand'], ['NH', cdp.NH, 'text-bull'], ['AL', cdp.AL, 'text-brand']].map(([k, v, c]) => (
              <div key={k} className="flex justify-between items-center">
                <span className={`font-bold ${c}`}>{k}</span>
                <span className="text-ink-1 font-mono nums">{v}</span>
              </div>
            ))}
          </div>
          <div className="flex items-center justify-center gap-2 mt-2 pt-2 border-t border-line text-xs">
            <span className="font-bold text-ink-3">CDP</span>
            <span className="font-bold text-ink-1 nums">{cdp.CDP}</span>
          </div>
        </div>
      )}

      {/* Misc */}
      {!showCdp && (subText || stock.strategy_name) && (
        <div className="border-t border-line pt-2 mt-2">
          {subText && (
            <div className="flex justify-between text-xs mb-0.5">
              <span className="text-ink-3">關鍵</span>
              <span className="text-brand font-medium">{subText}</span>
            </div>
          )}
          {stock.strategy_name && (
            <div className="flex justify-between text-xs">
              <span className="text-ink-3">策略</span>
              <span className="text-ink-2 truncate ml-2 max-w-[60%]">{stock.strategy_name}</span>
            </div>
          )}
        </div>
      )}

      {/* Footer CTA */}
      <div className="mt-3 flex items-center justify-end gap-1 text-[10px] text-ink-3 group-hover:text-brand transition-colors">
        <span>查看詳細分析</span>
        <ArrowRight size={10} className="group-hover:translate-x-0.5 transition-transform" />
      </div>
    </div>
  );
};

export default StockCard;
