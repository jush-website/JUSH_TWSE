import React, { useState, useEffect } from 'react';
import { getGlobalMarket, getNews, getFutures, getMarketOutlook } from '../services/api';
import {
  Globe, Newspaper, ExternalLink, TrendingUp, TrendingDown,
  Activity, Clock, AlertTriangle, CheckCircle, BarChart2,
} from 'lucide-react';
import ProgressLoader from '../components/ProgressLoader';
import { useCardAnimation } from '../hooks/useCardAnimation';
import CountUp from '../components/bits/CountUp';

const PctBadge = ({ value }) => {
  const pos = (value ?? 0) >= 0;
  return (
    <span className={`inline-flex items-center gap-0.5 text-xs font-semibold nums ${pos ? 'text-bull' : 'text-bear'}`}>
      {pos ? <TrendingUp size={11} /> : <TrendingDown size={11} />}
      {pos ? '+' : ''}{value}%
    </span>
  );
};

const Dashboard = () => {
  const [markets, setMarkets] = useState({});
  const [news, setNews] = useState({ taiwan: [], global: [] });
  const [futures, setFutures] = useState(null);
  const [outlook, setOutlook] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [mRes, nRes, fRes, oRes] = await Promise.all([
          getGlobalMarket(), getNews(), getFutures(), getMarketOutlook(),
        ]);
        setMarkets(mRes.data);
        setNews(nRes.data);
        setFutures(fRes.data);
        setOutlook(oRes.data);
      } catch (err) {
        console.error('Dashboard data fetch failed', err);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
    const interval = setInterval(fetchData, 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  const containerRef = useCardAnimation('.gsap-dashboard-card', [loading], {
    enabled: !loading, duration: 0.7, stagger: 0.08, ease: 'power3.out',
  });

  if (loading) return <ProgressLoader text="正在載入最新市場概況..." />;

  const isBull = outlook?.trend === '偏多' || outlook?.trend === '微多';
  const isBear = outlook?.trend === '偏空' || outlook?.trend === '微空';
  const outlookColor   = isBull ? 'text-bull' : isBear ? 'text-bear' : 'text-ink-2';
  const outlookBorder  = isBull ? 'border-bull/30'  : isBear ? 'border-bear/30'  : 'border-line';
  const outlookBg      = isBull ? 'bg-bull-muted'   : isBear ? 'bg-bear-muted'   : 'bg-panel';

  return (
    <div ref={containerRef} className="space-y-6">

      {/* ── Outlook Banner ── */}
      {outlook && (
        <section className={`gsap-dashboard-card ${outlookBg} border ${outlookBorder} rounded-xl p-4 sm:p-5`}>
          <div className="flex flex-wrap items-center justify-between gap-2 sm:gap-4 mb-3">
            <div className="flex items-center gap-2 min-w-0">
              <Activity size={18} className={`${outlookColor} shrink-0`} />
              <h2 className="font-semibold text-ink-1 truncate">台股走勢展望</h2>
            </div>
            <span className={`shrink-0 text-xs sm:text-sm font-bold px-2.5 sm:px-3 py-0.5 sm:py-1 rounded-full border ${outlookColor} ${outlookBorder} bg-panel`}>
              {outlook.trend}
            </span>
          </div>
          <p className="text-ink-2 text-sm mb-3 leading-relaxed">{outlook.trend_desc}</p>
          <ul className="space-y-1.5">
            {outlook.signals?.map((sig, idx) => {
              const isOk = sig.startsWith('✅');
              return (
                <li key={idx} className="flex items-start gap-2 text-xs text-ink-2">
                  {isOk
                    ? <CheckCircle size={13} className="text-brand shrink-0 mt-0.5" />
                    : <AlertTriangle size={13} className="text-yellow-500 dark:text-yellow-400 shrink-0 mt-0.5" />
                  }
                  <span>{sig.replace(/^✅ |^⚠️ /, '')}</span>
                </li>
              );
            })}
          </ul>
          <p className="mt-3 text-[10px] text-ink-3 italic">
            分析基於美股科技指數、台積電 ADR、外資資金流向、台指期等即時評估
          </p>
        </section>
      )}

      {/* ── Global Markets ── */}
      <section>
        <div className="flex items-center gap-2 mb-3">
          <Globe size={16} className="text-ink-3" />
          <h2 className="text-sm font-semibold text-ink-2 uppercase tracking-wider">全球市場</h2>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
          {futures?.price && (
            <div className="gsap-dashboard-card card p-4 col-span-2 md:col-span-1">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold text-ink-3">台指期</span>
                <span className="text-[10px] bg-overlay text-ink-3 px-1.5 py-0.5 rounded font-mono">
                  {futures.session}
                </span>
              </div>
              <div className="text-xl font-bold text-ink-1 nums mb-1"><CountUp value={futures.price} /></div>
              <PctBadge value={futures.change_pct} />
              {futures.date && <div className="text-[10px] text-ink-3 mt-1.5">{futures.date}</div>}
            </div>
          )}
          {Object.entries(markets).map(([name, data]) => (
            <div key={name} className="gsap-dashboard-card card p-4">
              <div className="text-xs text-ink-3 mb-2">{name}</div>
              <div className="text-lg font-bold text-ink-1 nums mb-1">
                <CountUp value={data.price} decimals={data.price >= 1000 ? 2 : undefined} />
              </div>
              <PctBadge value={data.change_pct} />
              {data.date && <div className="text-[10px] text-ink-3 mt-1.5">{data.date}</div>}
            </div>
          ))}
        </div>
      </section>

      {/* ── News ── */}
      <div className="grid md:grid-cols-2 gap-5">
        {[
          { key: 'taiwan', label: '台股要聞',  icon: Newspaper },
          { key: 'global', label: '國際財經',  icon: Globe },
        ].map(({ key, label, icon: Icon }) => (
          <section key={key}>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Icon size={15} className="text-ink-3" />
                <h2 className="text-sm font-semibold text-ink-2 uppercase tracking-wider">{label}</h2>
              </div>
              <div className="flex items-center gap-1 text-[10px] text-ink-3">
                <Clock size={10} />
                <span>即時更新</span>
              </div>
            </div>
            <div className="gsap-dashboard-card card divide-y divide-line max-h-[540px] overflow-y-auto">
              {news[key].map((item, idx) => (
                <a
                  key={idx}
                  href={item.url}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-start justify-between gap-3 p-3.5 hover:bg-overlay transition-colors group"
                >
                  <div className="min-w-0">
                    <p className="text-sm text-ink-1 group-hover:text-brand transition-colors leading-snug line-clamp-2">
                      {item.title}
                    </p>
                    <div className="mt-1.5 flex items-center gap-2 flex-wrap">
                      <span className="text-[10px] font-medium text-ink-3">{item.source}</span>
                      {item.time && (
                        <span className="text-[10px] text-ink-3 flex items-center gap-0.5">
                          <Clock size={9} />{item.time}
                        </span>
                      )}
                      {item.related_stocks?.map(sid => (
                        <span key={sid} className="text-[10px] bg-brand-muted text-brand px-1.5 py-0.5 rounded font-mono">
                          {sid}
                        </span>
                      ))}
                    </div>
                  </div>
                  <ExternalLink size={13} className="text-ink-3 shrink-0 mt-0.5 group-hover:text-brand transition-colors" />
                </a>
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
};

export default Dashboard;
