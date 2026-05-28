import os

code = """import { sma, ewma, calculateMacd, calculateRsi, calculateKd, calculateBollingerBands, calculateAtr, calculateDmi, calculateObv, calculateAd } from './indicators.js';

function classifyCategory(stockId, stockName, industry, volVolatility) {
  if (volVolatility > 40) return "高波動飆股";
  return industry || "未知產業";
}

function evaluateShortTerm(closeSeries, volumeSeries, isHighPos, isLowPos) {
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
  let score = 0;
  let signals = [];
  let lastClose = closeSeries[closeSeries.length - 1];
  let volAvg = sma(volumeSeries.slice(-6, -1), 5)[4] || 1;
  let currVol = volumeSeries[volumeSeries.length - 1];
  let volRatio = currVol / volAvg;
  
  let ma5 = sma(closeSeries, 5)[closeSeries.length - 1];
  let ma10 = sma(closeSeries, 10)[closeSeries.length - 1];
  let rsi = calculateRsi(closeSeries)[closeSeries.length - 1];

  if (lastClose > ma5 && ma5 > ma10) { score += 15; signals.push("均線多頭排列"); }
  else if (lastClose > ma5) { score += 5; signals.push("站上5日線"); }

  if (currVol >= 1000000) { score += 15; signals.push("流動性充裕"); }
  if (volRatio > 1.3) { score += 20; signals.push("量能增溫 (量比 " + (Math.round(volRatio * 10) / 10) + ")"); }

  let recentHigh20 = Math.max(...closeSeries.slice(Math.max(0, closeSeries.length - 20)));
  if (lastClose > recentHigh20) { score += 20; signals.push("突破盤整區間"); }

  if (rsi > 50 && rsi < 80) { score += 10; signals.push("RSI 強勢區"); }

  let netBuy3d = chipNetBuy.slice(-3).reduce((a, b) => a + b, 0);
  if (netBuy3d > 0) { score += 10; signals.push("法人少量佈局"); }

  let status = score >= 70 ? "短線極佳" : (score >= 45 ? "具潛力" : "觀察中");
  return { score, status, signals, stop_loss: Math.round(lastClose * 0.95 * 100) / 100 };
}

function evaluateBottomFishing(closeSeries, chipNetBuy, openSeries, highSeries, lowSeries, volumeSeries) {
  let score = 0;
  let signals = [];
  let lastClose = closeSeries[closeSeries.length - 1];
  let prevClose = closeSeries[closeSeries.length - 2];
  let lastOpen = openSeries[openSeries.length - 1];
  let prevOpen = openSeries[openSeries.length - 2];
  let lastHigh = highSeries[highSeries.length - 1];
  let lastLow = lowSeries[lowSeries.length - 1];
  
  let ma60 = sma(closeSeries, 60)[closeSeries.length - 1];
  let biasMa60 = (lastClose - ma60) / (ma60 || 1);

  if (biasMa60 <= -0.10) { score += 35; signals.push("極度超跌 (季線乖離 " + Math.round(biasMa60*100) + "%)"); }
  else if (biasMa60 <= -0.06) { score += 20; signals.push("波段超跌 (季線乖離 " + Math.round(biasMa60*100) + "%)"); }

  let recentLow60 = Math.min(...lowSeries.slice(Math.max(0, lowSeries.length - 60)));
  if (lastLow <= recentLow60 * 1.01) { score += 20; signals.push("歷史低價區 (近60日低點)"); }

  let rsi = calculateRsi(closeSeries)[closeSeries.length - 1];
  if (rsi < 25) { score += 25; signals.push("指標極度超賣 (RSI=" + Math.round(rsi) + ")"); }
  else if (rsi < 35) { score += 15; signals.push("進入超賣區 (RSI=" + Math.round(rsi) + ")"); }

  let { k, d } = calculateKd(highSeries, lowSeries, closeSeries);
  let lastK = k[k.length - 1], lastD = d[d.length - 1];
  if (lastK < 20 && lastD < 20) {
    if (lastK > lastD) { score += 25; signals.push("KD低檔金叉 (強烈止跌訊號)"); }
    else { score += 10; signals.push("KD低檔超賣"); }
  }

  let body = Math.abs(lastClose - lastOpen);
  let lowerShadow = Math.min(lastClose, lastOpen) - lastLow;
  let upperShadow = lastHigh - Math.max(lastClose, lastOpen);
  if (lowerShadow > body * 2.0 && lowerShadow > upperShadow) { score += 25; signals.push("出現止跌鎚頭線"); }
  else if (lastClose > prevOpen && lastOpen < prevClose && prevClose < prevOpen) { score += 20; signals.push("多方吞噬 (陽包陰)"); }

  let volAvg = sma(volumeSeries.slice(-6, -1), 5)[4] || 1;
  let currVol = volumeSeries[volumeSeries.length - 1];
  if (currVol < volAvg * 0.5) { score += 15; signals.push("出現底部窒息量"); }
  else if (currVol > volAvg * 1.8 && lastClose > lastOpen) { score += 20; signals.push("底部爆量攻擊 (換手轉強)"); }

  let netBuy3d = chipNetBuy.slice(-3).reduce((a, b) => a + b, 0);
  if (netBuy3d > 100000) { score += 10; signals.push("法人低檔佈局"); }

  let status = score >= 75 ? "抄底絕佳標的" : (score >= 55 ? "初步止跌跡象" : (score >= 40 ? "尋找支撐中" : "仍處跌勢"));
  let stopLoss = Math.round(Math.min(lastLow, lastClose * 0.95) * 100) / 100;

  return { score, status, signals, stop_loss: stopLoss, bias_ma60: Math.round(biasMa60 * 1000) / 1000 };
}

function evaluateShortTermBurst(closeSeries, chipNetBuy, openSeries, highSeries, lowSeries, volumeSeries) {
  let score = 0;
  let signals = [];
  let lastClose = closeSeries[closeSeries.length - 1];
  let prevClose = closeSeries[closeSeries.length - 2];
  let lastOpen = openSeries[openSeries.length - 1];
  let prevOpen = openSeries[openSeries.length - 2];
  let lastHigh = highSeries[highSeries.length - 1];
  let lastLow = lowSeries[lowSeries.length - 1];

  let ma5 = sma(closeSeries, 5)[closeSeries.length - 1];
  let ma10 = sma(closeSeries, 10)[closeSeries.length - 1];
  let volAvg = sma(volumeSeries.slice(-6, -1), 5)[4] || 1;
  let volRatio = volumeSeries[volumeSeries.length - 1] / volAvg;

  if (volumeSeries[volumeSeries.length - 1] >= 2000000) { score += 15; signals.push("流動性佳"); }
  if (volRatio > 1.3) { score += 15; signals.push("量增 (量比 " + Math.round(volRatio * 10) / 10 + ")"); }

  if (lastClose > ma5 && ma5 > ma10) { score += 20; signals.push("多頭排列"); }

  if (lastLow <= ma5 * 1.01 && lastClose > ma5) { score += 20; signals.push("回踩 5 日線 (支撐確認)"); }
  else if (lastLow <= ma10 * 1.01 && lastClose > ma10) { score += 15; signals.push("回踩 10 日線"); }

  let recentHigh20 = Math.max(...highSeries.slice(Math.max(0, highSeries.length - 20)));
  if (lastClose > recentHigh20 && volRatio > 1.5) { score += 25; signals.push("強勢突破前高"); }

  if (prevClose < prevOpen && lastClose > prevOpen && lastOpen < prevClose) { score += 20; signals.push("型態：陽包陰"); }

  let body = Math.abs(lastClose - lastOpen);
  let lowerShadow = Math.min(lastClose, lastOpen) - lastLow;
  if (lowerShadow > body * 1.8 && lastClose > lastOpen) { score += 15; signals.push("型態：長下影線"); }

  let rsiSeries = calculateRsi(closeSeries);
  if (rsiSeries[rsiSeries.length - 1] > 50 && rsiSeries[rsiSeries.length - 1] > rsiSeries[rsiSeries.length - 2]) {
    score += 15; signals.push("RSI 轉折向上");
  }

  let { k, d } = calculateKd(highSeries, lowSeries, closeSeries);
  if (k[k.length - 1] > d[d.length - 1] && k[k.length - 2] <= d[d.length - 2]) {
    score += 15; signals.push("KD 金叉");
  }

  let netBuy3d = chipNetBuy.slice(-3).reduce((a, b) => a + b, 0);
  if (netBuy3d > 200000) { score += 10; signals.push("法人布局"); }

  let status = score >= 65 ? "短線強烈推薦" : (score >= 45 ? "短線動能增強" : "動能整理中");
  return { score, status, signals, stop_loss: Math.round(Math.min(lastLow, lastClose * 0.97) * 100) / 100 };
}

function calculateCdp(highSeries, lowSeries, closeSeries, intradaySnapshot) {
  let h = highSeries[highSeries.length - 1];
  let l = lowSeries[lowSeries.length - 1];
  let c = closeSeries[closeSeries.length - 1];
  let baseDate = intradaySnapshot?.cdp_base_date || "最新資料";

  if (intradaySnapshot && intradaySnapshot.yesterday_high) {
    h = intradaySnapshot.yesterday_high;
    l = intradaySnapshot.yesterday_low;
    c = intradaySnapshot.yesterday_close;
  }

  let cdp = (h + l + 2 * c) / 4;
  let ah = cdp + (h - l);
  let nh = cdp * 2 - l;
  let nl = cdp * 2 - h;
  let al = cdp - (h - l);
  
  let signals = [];
  if (intradaySnapshot && intradaySnapshot.price) {
    let openP = intradaySnapshot.open;
    let price = intradaySnapshot.price;
    if (openP) {
      if (openP > cdp) signals.push("開盤 > CDP (" + openP + " > " + Math.round(cdp*100)/100 + ")，偏多");
      else signals.push("開盤 < CDP (" + openP + " < " + Math.round(cdp*100)/100 + ")，偏空");

      if (openP >= ah) signals.push("開盤突破 AH，動能強勁可追漲");
      else if (openP <= al) signals.push("開盤跌破 AL，盤勢弱順勢偏空");
    }
    
    if (price >= ah) signals.push("觸及 AH，考慮獲利了結");
    else if (price >= nh) signals.push("突破 NH，短線賣點");

    if (price <= al) signals.push("觸及 AL，考慮低接佈局");
    else if (price <= nl) signals.push("跌破 NL，短線買點");
  }

  return {
    CDP: Math.round(cdp * 100) / 100,
    AH: Math.round(ah * 100) / 100,
    NH: Math.round(nh * 100) / 100,
    NL: Math.round(nl * 100) / 100,
    AL: Math.round(al * 100) / 100,
    base_date: baseDate,
    signals: signals
  };
}

function evaluateDayTradeCdp(closeSeries, isLimitUp, isLimitDown, cdpRes, volumeSeries, highSeries, lowSeries, openSeries) {
  let score = 0;
  let signals = [];
  let status = "一般";
  
  let lastClose = closeSeries[closeSeries.length - 1];
  let prevClose = closeSeries[closeSeries.length - 2];
  let prevHigh = highSeries[highSeries.length - 2];
  let prevLow = lowSeries[lowSeries.length - 2];
  let prevOpen = openSeries[openSeries.length - 2];
  
  let changePct = ((lastClose - prevClose) / prevClose) * 100;
  
  let amplitude = 0;
  if (prevOpen > 0) amplitude = (prevHigh - prevLow) / prevOpen;
  
  if (amplitude >= 0.03 && amplitude <= 0.08) { score += 20; signals.push("前日波幅適中 (" + Math.round(amplitude * 100) + "%)"); }
  else if (amplitude > 0.08) { score += 5; signals.push("前日波動劇烈"); }
  else { score -= 10; signals.push("前日波動過小"); }

  let volAvg = sma(volumeSeries.slice(-6, -1), 5)[4] || 1;
  let currVol = volumeSeries[volumeSeries.length - 1];
  let volRatio = currVol / volAvg;
  
  if (volRatio > 1.5) { score += 15; signals.push("量能放大有利當沖"); }
  
  if (isLimitUp) { score += 20; signals.push("強勢鎖漲停 (隔日沖首選)"); status = "強勢隔日沖"; }
  else if (changePct >= 7) { score += 15; signals.push("漲幅逾7%，動能強"); }
  
  let cdp = cdpRes.CDP, ah = cdpRes.AH, nh = cdpRes.NH;
  if (lastClose >= ah) { score += 10; signals.push("收盤突破 AH，極強勢"); }
  else if (lastClose >= cdp) { score += 5; signals.push("收盤站上 CDP，偏多"); }
  
  if (score >= 60) status = "強勢隔日沖";
  else if (score >= 40) status = "具當沖潛力";
  
  return { score: Math.max(0, score), status, signals };
}

function evaluateOpeningChecklist(intradaySnapshot) {
  if (!intradaySnapshot || !intradaySnapshot.open) return null;
  let score = 50;
  let status = "中性";
  let signals = [];
  
  if (intradaySnapshot.price < intradaySnapshot.open) {
    signals.push("觸發強制出場條件");
    status = "立刻走人";
    score = 20;
  } else if (intradaySnapshot.price > intradaySnapshot.open) {
    signals.push("開盤走高");
    status = "符合觀察";
    score = 60;
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
  const { stock_id, stock_name, category, price_data, chip_data, margin_data, intraday } = payload;
  
  if (!price_data || price_data.length < 35) {
    return { error: "資料不足" };
  }

  let dateSeries = [];
  let openSeries = [];
  let highSeries = [];
  let lowSeries = [];
  let closeSeries = [];
  let volumeSeries = [];
  
  for (let row of price_data) {
    dateSeries.push(row.date);
    openSeries.push(row.open || row.Open);
    highSeries.push(row.max || row.high || row.High);
    lowSeries.push(row.min || row.low || row.Low);
    closeSeries.push(row.close || row.Close);
    volumeSeries.push(row.Trading_Volume || row.Volume);
  }

  let chipNetBuyMap = {};
  if (chip_data) {
    for (let row of chip_data) {
      if (!chipNetBuyMap[row.date]) chipNetBuyMap[row.date] = 0;
      chipNetBuyMap[row.date] += (row.buy - row.sell);
    }
  }
  let chipNetBuy = dateSeries.map(d => chipNetBuyMap[d] || 0);

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
  
  let isEtf = false; 
  let categoryStr = category || classifyCategory(stock_id, stock_name, "未知", 20);
  
  let stRes = evaluateShortTerm(closeSeries, volumeSeries, false, false);
  let stratRes = calculateEntryStrategy(closeSeries, volumeSeries, bb.upper, bb.middle, intraday);
  let cdpRes = calculateCdp(highSeries, lowSeries, closeSeries, intraday);
  let openingChecklist = evaluateOpeningChecklist(intraday);
  
  let bottomFishingRes = evaluateBottomFishing(closeSeries, chipNetBuy, openSeries, highSeries, lowSeries, volumeSeries);
  let stBurstRes = evaluateShortTermBurst(closeSeries, chipNetBuy, openSeries, highSeries, lowSeries, volumeSeries);
  let dayTradeCdpRes = evaluateDayTradeCdp(closeSeries, changePct >= 9.7, changePct <= -9.7, cdpRes, volumeSeries, highSeries, lowSeries, openSeries);

  let diag = [];
  // 1. 均線診斷
  if (lastClose > ma60[lastIdx]) diag.push("均線診斷：站上季線(生命線)");
  if (ma5[lastIdx] > ma10[lastIdx] && ma10[lastIdx] > ma20[lastIdx]) diag.push("均線診斷：短中期均線呈多頭排列");
  
  // 2. K線型態與位階
  let recentHigh20 = Math.max(...highSeries.slice(Math.max(0, highSeries.length - 20)));
  if (lastClose >= recentHigh20 * 0.98) diag.push("位階診斷：挑戰前高 (" + Math.round(recentHigh20*100)/100 + ")");
  
  // 3. MACD 診斷
  if (macd.macdHist[lastIdx] > 0 && macd.macdHist[prevIdx] <= 0) diag.push("MACD診斷：紅柱剛翻紅，轉強訊號");
  else if (macd.macdHist[lastIdx] > 0) diag.push("MACD診斷：維持多方格局");
  else diag.push("MACD診斷：空方格局");

  // 4. 趨勢強度 (DMI)
  if (dmi.adx[lastIdx] > 25) diag.push("趨勢確認：目前為強勢趨勢 (ADX=" + Math.round(dmi.adx[lastIdx]*10)/10 + ")");
  else if (dmi.adx[lastIdx] < 20) diag.push("盤整特徵：目前趨勢不明確，建議觀望 (ADX=" + Math.round(dmi.adx[lastIdx]*10)/10 + ")");

  // 5. 乖離率診斷
  if (bias20[lastIdx] > 5) diag.push("乖離過大 (20MA：" + Math.round(bias20[lastIdx]*10)/10 + "%)，防追高");
  else if (bias20[lastIdx] < -5) diag.push("超賣訊號 (20MA：" + Math.round(bias20[lastIdx]*10)/10 + "%)，醞釀反彈");

  // 6. 年線診斷
  if (ma240[lastIdx]) {
    if (lastClose > ma240[lastIdx]) diag.push("長線趨勢偏多 (站上年線)");
    else diag.push("長線趨勢偏弱 (年線之下)");
  }

  // 7. 盤中檢核
  if (openingChecklist) {
    if (openingChecklist.score >= 40) diag.push("開盤檢核：" + openingChecklist.status + " (" + openingChecklist.score + "分)");
    if (openingChecklist.signals.includes("觸發強制出場條件")) diag.push("!!! 警告：股價跌破開盤價，請嚴守紀律停損 !!!");
  }

  // 8. 策略與CDP訊號
  if (bottomFishingRes.score >= 50) diag.push("抄底訊號：" + bottomFishingRes.status);
  if (stBurstRes.score >= 60) diag.push("短線爆發：" + stBurstRes.status);
  if (cdpRes.signals && cdpRes.signals.length > 0) diag.push(...cdpRes.signals);

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
    kd: (Math.round(k[lastIdx] * 10) / 10) + "/" + (Math.round(d[lastIdx] * 10) / 10),
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
    day_trade_cdp_rec: dayTradeCdpRes,
    low_pe_rec: { score: 40, status: "未達條件", signals: [] },
    bottom_fishing_rec: bottomFishingRes,
    short_term_burst_rec: stBurstRes,
    etf_rec: { score: 0, status: "非ETF", signals: [] },
    opening_checklist: openingChecklist,
    volume_patterns: [],
    entry_notes: [],
    exit_rule: stratRes.exit_rule,
    chart_data: chartData
  };
}
"""

with open("src/frontend/utils/analyzer.js", "w", encoding="utf-8") as f:
    f.write(code)

print("Done patching analyzer.js")
