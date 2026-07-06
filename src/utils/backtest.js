// CDP 當沖策略回測：對已載入的日 K 資料做規則模擬，不需要額外 API。
// 規則（與系統當沖偵測的 CDP 邏輯一致）：
//   用前一日高低收算 CDP 價位，當日開盤在 NL 之上、盤中拉回觸及 NL 視為在 NL 進場做多，
//   盤中觸及 NH 在 NH 出場，否則收盤出場。
// 純歷史模擬：未計手續費、證交稅與滑價，結果僅供參考，不代表未來績效。
export function backtestCdpDayTrade(bars, days = 60) {
  if (!bars || bars.length < 2) return null;
  const win = bars.slice(-(days + 1));
  const trades = [];
  for (let i = 1; i < win.length; i++) {
    const p = win[i - 1];
    const d = win[i];
    if (!p.high || !p.low || !p.close || !d.low || !d.open) continue;
    const cdp = (p.high + p.low + 2 * p.close) / 4;
    const nh = 2 * cdp - p.low;
    const nl = 2 * cdp - p.high;
    if (d.open > nl && d.low <= nl) {
      const exit = d.high >= nh ? nh : d.close;
      trades.push({ date: d.date, ret: ((exit - nl) / nl) * 100 });
    }
  }
  if (trades.length === 0) return null;
  const wins = trades.filter(t => t.ret > 0).length;
  const avg = trades.reduce((s, t) => s + t.ret, 0) / trades.length;
  const cum = trades.reduce((s, t) => s * (1 + t.ret / 100), 1);
  return {
    days: Math.min(days, win.length - 1),
    trades: trades.length,
    winRate: Math.round((wins / trades.length) * 1000) / 10,
    avgReturn: Math.round(avg * 100) / 100,
    cumReturn: Math.round((cum - 1) * 10000) / 100,
    worst: Math.round(Math.min(...trades.map(t => t.ret)) * 100) / 100,
  };
}
