import { sma, ewma, calculateMacd, calculateRsi, calculateKd, calculateBollingerBands, calculateAtr, calculateDmi, calculateObv, calculateAd } from './indicators.js';

function classifyCategory(stockId, stockName, industry, volVolatility) {
  if (volVolatility > 40) return "高波動飆股";
  return industry || "未知產業";
}

function evaluateShortTerm(closeSeries, volumeSeries, isHighPos, isLowPos) {
  // 簡易實作 Python 版的 evaluate_short_term
  let score = 50;
  let status = "中性整理";
  let volAvg = sma(volumeSeries.slice(-6, -1), 5)[4] || 1;
  let currVol = volumeSeries[volumeSeries.length - 1];
  let volRatio = currVol / volAvg;
  
  if (volRatio > 1.5) score += 10;
  else if (volRatio < 0.5) score -= 5;
  
  if (closeSeries[closeSeries.length - 1] > closeSeries[closeSeries.length - 2]) {
    score += 10;
    status = "偏多震盪";
  } else {
    score -= 10;
    status = "偏空震盪";
  }

  if (score >= 70) status = "強勢多頭";
  else if (score <= 30) status = "弱勢空頭";
  
  return { score, status, vol_ratio: Math.round(volRatio * 100) / 100 };
}

function evaluateShortTermRecommendation(closeSeries, volumeSeries, chipNetBuy) {
  let score = 50;
  let status = "中性";
  let signals = [];
  
  let volAvg = sma(volumeSeries.slice(-6, -1), 5)[4] || 1;
  let currVol = volumeSeries[volumeSeries.length - 1];
  
  if (currVol < volAvg * 0.5) {
    score += 15;
    signals.push("出現底部窒息量");
  } else if (currVol > volAvg * 1.8) {
    score += 20;
    signals.push("底部帶量突破");
  }
  
  let netBuy3d = chipNetBuy.slice(-3).reduce((a, b) => a + b, 0);
  if (netBuy3d > 100000) {
    score += 10;
    signals.push("法人低檔佈局");
  }
  
  if (score >= 75) status = "短線絕佳標的";
  else if (score >= 55) status = "初步止跌跡象";
  else if (score >= 40) status = "尋找支撐中";
  else status = "仍在跌勢";
  
  return { score, status, signals, stop_loss: closeSeries[closeSeries.length - 1] * 0.95 };
}

function evaluateBottomFishing(closeSeries, chipNetBuy) {
  // 簡化版的抄底
  let signals = [];
  return { score: 40, status: "未達抄底條件", signals };
}

function evaluateShortTermBurst(closeSeries, chipNetBuy) {
  return { score: 40, status: "未達爆發條件", signals: [] };
}

function calculateCdp(highSeries, lowSeries, closeSeries, intradaySnapshot) {
  let h = highSeries[highSeries.length - 1];
  let l = lowSeries[lowSeries.length - 1];
  let c = closeSeries[closeSeries.length - 1];
  let cdp = (h + l + 2 * c) / 4;
  let ah = cdp + (h - l);
  let nh = cdp * 2 - l;
  let nl = cdp * 2 - h;
  let al = cdp - (h - l);
  return {
    cdp: Math.round(cdp * 100) / 100,
    ah: Math.round(ah * 100) / 100,
    nh: Math.round(nh * 100) / 100,
    nl: Math.round(nl * 100) / 100,
    al: Math.round(al * 100) / 100,
    signals: []
  };
}

function evaluateDayTradeCdp(closeSeries, isLimitUp, isLimitDown, cdpRes) {
  return { score: 50, status: "中性", signals: [] };
}

function evaluateOpeningChecklist(intradaySnapshot) {
  if (!intradaySnapshot || !intradaySnapshot.open) return null;
  let score = 50;
  let status = "中性";
  let signals = [];
  
  if (intradaySnapshot.price < intradaySnapshot.open) {
    signals.push("觸發強制出場條件");
    status = "立刻走人";
  } else {
    status = "符合觀察";
  }
  
  return { score, status, signals, details: [] };
}

function calculateEntryStrategy(closeSeries, volSeries, upper, middle, intradaySnapshot) {
  let close = closeSeries[closeSeries.length - 1];
  let volAvg = sma(volSeries.slice(-6, -1), 5)[4] || 1;
  let volRatio = volSeries[volSeries.length - 1] / volAvg;
  
  let strategy = "中性觀望";
  let entryRange = "建議等候拉回";
  let stopLoss = Math.round(close * 0.93 * 100) / 100;
  let takeProfit = Math.round(close * 1.1 * 100) / 100;
  let strategyNotes = ["區間震盪"];
  let exitRule = "跌破今日開盤價或停損點出場";
  
  if (close >= upper[upper.length - 1] * 0.98 && volRatio > 1.3) {
    strategy = "強勢突破";
    entryRange = "現價進場";
    stopLoss = Math.round(close * 0.95 * 100) / 100;
    strategyNotes = ["爆發潛力"];
  }
  
  if (intradaySnapshot && intradaySnapshot.open) {
    if (close < intradaySnapshot.open) {
      strategy = "立刻退場";
      strategyNotes.push("!!! 已經跌破今日開盤價，符合強制出場條件 !!!");
    }
  }
  
  return { strategy, entry_range: entryRange, stop_loss: stopLoss, take_profit: takeProfit, strategy_notes: strategyNotes, exit_rule: exitRule };
}

export function analyzeStockData(payload) {
  const { stock_id, price_data, chip_data, margin_data, intraday } = payload;
  
  if (!price_data || price_data.length < 35) {
    return { error: "資料不足" };
  }

  // 整理價量資料
  let dateSeries = [];
  let openSeries = [];
  let highSeries = [];
  let lowSeries = [];
  let closeSeries = [];
  let volumeSeries = [];
  
  for (let row of price_data) {
    dateSeries.push(row.date);
    openSeries.push(row.open || row.Open);
    highSeries.push(row.high || row.High);
    lowSeries.push(row.low || row.Low);
    closeSeries.push(row.close || row.Close);
    volumeSeries.push(row.Trading_Volume || row.Volume);
  }

  // 整理籌碼資料 (net_buy)
  let chipNetBuyMap = {};
  if (chip_data) {
    for (let row of chip_data) {
      if (!chipNetBuyMap[row.date]) chipNetBuyMap[row.date] = 0;
      chipNetBuyMap[row.date] += (row.buy - row.sell);
    }
  }
  let chipNetBuy = dateSeries.map(d => chipNetBuyMap[d] || 0);

  // 技術指標計算
  let ma5 = sma(closeSeries, 5);
  let ma10 = sma(closeSeries, 10);
  let ma20 = sma(closeSeries, 20);
  let ma60 = sma(closeSeries, 60);
  let ma120 = sma(closeSeries, 120);
  let ma240 = sma(closeSeries, 240);
  
  let { k, d } = calculateKd(highSeries, lowSeries, closeSeries);
  let rsi = calculateRsi(closeSeries);
  let macd = calculateMacd(closeSeries);
  let bb = calculateBollingerBands(closeSeries);
  let dmi = calculateDmi(highSeries, lowSeries, closeSeries);
  let atr = calculateAtr(highSeries, lowSeries, closeSeries);
  let obv = calculateObv(closeSeries, volumeSeries);
  
  // Bias
  let bias20 = [];
  for (let i = 0; i < closeSeries.length; i++) {
    if (ma20[i]) bias20.push(((closeSeries[i] - ma20[i]) / ma20[i]) * 100);
    else bias20.push(null);
  }

  let lastIdx = closeSeries.length - 1;
  let prevIdx = lastIdx - 1;
  
  let lastClose = closeSeries[lastIdx];
  let prevClose = closeSeries[prevIdx];
  let changePct = ((lastClose - prevClose) / prevClose) * 100;
  
  let isEtf = false; // 簡化
  let categoryStr = category || classifyCategory(stock_id, stock_name, "未知", 20);
  
  let stRes = evaluateShortTerm(closeSeries, volumeSeries, false, false);
  let stratRes = calculateEntryStrategy(closeSeries, volumeSeries, bb.upper, bb.middle, intraday);
  let cdpRes = calculateCdp(highSeries, lowSeries, closeSeries, intraday);
  let openingChecklist = evaluateOpeningChecklist(intraday);
  
  let diag = [];
  if (lastClose > ma60[lastIdx]) diag.push("站上生命線");
  if (macd.macdHist[lastIdx] > 0) diag.push("MACD多頭"); else diag.push("MACD空頭");
  if (dmi.adx[lastIdx] > 25) diag.push("趨勢確認：ADX大於25");
  if (bias20[lastIdx] > 5) diag.push(`乖離率過高：${(Math.round(bias20[lastIdx] * 10) / 10)}%`);
  
  let chartData = [];
  let chartStart = Math.max(0, closeSeries.length - 60);
  for (let i = chartStart; i < closeSeries.length; i++) {
    chartData.push({
      date: dateSeries[i] ? dateSeries[i].substring(5) : "",
      volume: Math.round(volumeSeries[i] / 1000),
      close: Math.round(closeSeries[i] * 100) / 100,
      macd_hist: Math.round(macd.macdHist[i] * 1000) / 1000,
      macd_line: Math.round(macd.macdLine[i] * 1000) / 1000,
      macd_signal: Math.round(macd.macdSignal[i] * 1000) / 1000
    });
  }

  return {
    stock_id: stock_id,
    stock_name: stock_name || "未知標的", 
    is_etf: isEtf,
    category: categoryStr,
    total_score: stRes.score,
    price: Math.round(lastClose * 100) / 100,
    yesterday_close: Math.round(prevClose * 100) / 100,
    change_percent: Math.round(changePct * 100) / 100,
    is_limit_up: changePct >= 9.7,
    vol_ratio: stRes.vol_ratio,
    kd: `${Math.round(k[lastIdx] * 10) / 10}/${Math.round(d[lastIdx] * 10) / 10}`,
    rsi: Math.round(rsi[lastIdx] * 10) / 10,
    macd: macd.macdHist[lastIdx] > 0 ? "多方" : "空方",
    ma5: Math.round(ma5[lastIdx] * 100) / 100,
    ma20: Math.round(ma20[lastIdx] * 100) / 100,
    ma60: Math.round(ma60[lastIdx] * 100) / 100,
    ma120: Math.round(ma120[lastIdx] * 100) / 100,
    atr: Math.round(atr[lastIdx] * 100) / 100,
    volatility: 20,
    adx: Math.round(dmi.adx[lastIdx] * 10) / 10,
    bias_20: Math.round(bias20[lastIdx] * 10) / 10,
    net_buy_3d: Math.round(chipNetBuy.slice(-3).reduce((a, b) => a + b, 0) / 1000),
    recommend_status: stRes.status,
    diagnosis: diag,
    pe: 15.0,
    yield: 4.0,
    roe: 10.0,
    debt_ratio: 50.0,
    entry_range: stratRes.entry_range,
    stop_loss: stratRes.stop_loss,
    take_profit: stratRes.take_profit,
    strategy_name: stratRes.strategy,
    overnight: { score: 0, status: "N/A", signals: [] },
    short_term_rec: evaluateShortTermRecommendation(closeSeries, volumeSeries, chipNetBuy),
    cdp: cdpRes,
    day_trade_cdp_rec: evaluateDayTradeCdp(closeSeries, changePct >= 9.7, changePct <= -9.7, cdpRes),
    low_pe_rec: { score: 40, status: "未達條件", signals: [] },
    bottom_fishing_rec: evaluateBottomFishing(closeSeries, chipNetBuy),
    short_term_burst_rec: evaluateShortTermBurst(closeSeries, chipNetBuy),
    etf_rec: { score: 0, status: "非ETF", signals: [] },
    opening_checklist: openingChecklist,
    volume_patterns: [],
    entry_notes: [],
    exit_rule: stratRes.exit_rule,
    chart_data: chartData
  };
}
