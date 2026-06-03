import { sma, ewma, calculateMacd, calculateRsi, calculateKd, calculateBollingerBands, calculateAtr, calculateDmi, calculateObv, calculateAd } from './indicators.js';

function classifyCategory(stockId, stockName, industry, volVolatility) {
  if (volVolatility > 40) return "擃郭????;
  return industry || "?芰?Ｘ平";
}

function evaluateShortTerm(closeSeries, volumeSeries, isHighPos, isLowPos) {
  let score = 50;
  let status = "銝剜扳??;
  let volAvg = sma(volumeSeries.slice(-6, -1), 5)[4] || 1;
  let currVol = volumeSeries[volumeSeries.length - 1];
  let volRatio = currVol / volAvg;
  
  if (volRatio > 1.5) score += 10;
  else if (volRatio < 0.5) score -= 5;
  
  if (closeSeries[closeSeries.length - 1] > closeSeries[closeSeries.length - 2]) {
    score += 10;
    status = "???";
  } else {
    score -= 10;
    status = "?征?";
  }

  if (score >= 70) status = "撘瑕憭";
  else if (score <= 30) status = "撘勗蝛粹";
  
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

  if (lastClose > ma5 && ma5 > ma10) { score += 15; signals.push("??憭??"); }
  else if (lastClose > ma5) { score += 5; signals.push("蝡?5?亦?"); }

  if (currVol >= 1000000) { score += 15; signals.push("瘚??批?鋆?); }
  if (volRatio > 1.3) { score += 20; signals.push("?憓澈 (?? " + (Math.round(volRatio * 10) / 10) + ")"); }

  let recentHigh20 = Math.max(...closeSeries.slice(Math.max(0, closeSeries.length - 20)));
  if (lastClose > recentHigh20) { score += 20; signals.push("蝒?斗???); }

  if (rsi > 50 && rsi < 80) { score += 10; signals.push("RSI 撘瑕?"); }

  let netBuy3d = chipNetBuy.slice(-3).reduce((a, b) => a + b, 0);
  if (netBuy3d > 0) { score += 10; signals.push("瘜犖撠?雿?"); }

  let status = score >= 70 ? "?剔?璆萎蔔" : (score >= 45 ? "?瑟??? : "閫撖葉");
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

  if (biasMa60 <= -0.10) { score += 35; signals.push("璆萄漲頞? (摮??銋 " + Math.round(biasMa60*100) + "%)"); }
  else if (biasMa60 <= -0.06) { score += 20; signals.push("瘜Ｘ挾頞? (摮??銋 " + Math.round(biasMa60*100) + "%)"); }

  let recentLow60 = Math.min(...lowSeries.slice(Math.max(0, lowSeries.length - 60)));
  if (lastLow <= recentLow60 * 1.01) { score += 20; signals.push("甇瑕雿? (餈?0?乩?暺?"); }

  let rsi = calculateRsi(closeSeries)[closeSeries.length - 1];
  if (rsi < 25) { score += 25; signals.push("??璆萄漲頞都 (RSI=" + Math.round(rsi) + ")"); }
  else if (rsi < 35) { score += 15; signals.push("?脣頞都? (RSI=" + Math.round(rsi) + ")"); }

  let { k, d } = calculateKd(highSeries, lowSeries, closeSeries);
  let lastK = k[k.length - 1], lastD = d[d.length - 1];
  if (lastK < 20 && lastD < 20) {
    if (lastK > lastD) { score += 25; signals.push("KD雿??? (撘瑞?甇Ｚ?閮?)"); }
    else { score += 10; signals.push("KD雿?頞都"); }
  }

  let body = Math.abs(lastClose - lastOpen);
  let lowerShadow = Math.min(lastClose, lastOpen) - lastLow;
  let upperShadow = lastHigh - Math.max(lastClose, lastOpen);
  if (lowerShadow > body * 2.0 && lowerShadow > upperShadow) { score += 25; signals.push("?箇甇Ｚ??蝺?); }
  else if (lastClose > prevOpen && lastOpen < prevClose && prevClose < prevOpen) { score += 20; signals.push("憭? (?賢???"); }

  let volAvg = sma(volumeSeries.slice(-6, -1), 5)[4] || 1;
  let currVol = volumeSeries[volumeSeries.length - 1];
  if (currVol < volAvg * 0.5) { score += 15; signals.push("?箇摨蝒??); }
  else if (currVol > volAvg * 1.8 && lastClose > lastOpen) { score += 20; signals.push("摨???餅? (??頧撥)"); }

  let netBuy3d = chipNetBuy.slice(-3).reduce((a, b) => a + b, 0);
  if (netBuy3d > 100000) { score += 10; signals.push("瘜犖雿?雿?"); }

  let status = score >= 75 ? "??蝯蔔璅?" : (score >= 55 ? "?郊甇Ｚ?頝∟情" : (score >= 40 ? "撠?舀?銝? : "隞?頝"));
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

  if (volumeSeries[volumeSeries.length - 1] >= 2000000) { score += 15; signals.push("瘚??找蔔"); }
  if (volRatio > 1.3) { score += 15; signals.push("?? (?? " + Math.round(volRatio * 10) / 10 + ")"); }

  if (lastClose > ma5 && ma5 > ma10) { score += 20; signals.push("憭??"); }

  if (lastLow <= ma5 * 1.01 && lastClose > ma5) { score += 20; signals.push("?萱 5 ?亦? (?舀?蝣箄?)"); }
  else if (lastLow <= ma10 * 1.01 && lastClose > ma10) { score += 15; signals.push("?萱 10 ?亦?"); }

  let recentHigh20 = Math.max(...highSeries.slice(Math.max(0, highSeries.length - 20)));
  if (lastClose > recentHigh20 && volRatio > 1.5) { score += 25; signals.push("撘瑕蝒??"); }

  if (prevClose < prevOpen && lastClose > prevOpen && lastOpen < prevClose) { score += 20; signals.push("??嚗?"); }

  let body = Math.abs(lastClose - lastOpen);
  let lowerShadow = Math.min(lastClose, lastOpen) - lastLow;
  if (lowerShadow > body * 1.8 && lastClose > lastOpen) { score += 15; signals.push("??嚗銝蔣蝺?); }

  let rsiSeries = calculateRsi(closeSeries);
  if (rsiSeries[rsiSeries.length - 1] > 50 && rsiSeries[rsiSeries.length - 1] > rsiSeries[rsiSeries.length - 2]) {
    score += 15; signals.push("RSI 頧???");
  }

  let { k, d } = calculateKd(highSeries, lowSeries, closeSeries);
  if (k[k.length - 1] > d[d.length - 1] && k[k.length - 2] <= d[d.length - 2]) {
    score += 15; signals.push("KD ??");
  }

  let netBuy3d = chipNetBuy.slice(-3).reduce((a, b) => a + b, 0);
  if (netBuy3d > 200000) { score += 10; signals.push("瘜犖撣?"); }

  let status = score >= 65 ? "?剔?撘瑞??刻" : (score >= 45 ? "?剔??憓撥" : "??渡?銝?);
  return { score, status, signals, stop_loss: Math.round(Math.min(lastLow, lastClose * 0.97) * 100) / 100 };
}

function calculateCdp(highSeries, lowSeries, closeSeries, intradaySnapshot, lastDate) {
  let h = highSeries[highSeries.length - 1];
  let l = lowSeries[lowSeries.length - 1];
  let c = closeSeries[closeSeries.length - 1];
  let baseDate = intradaySnapshot?.cdp_base_date || lastDate || "??啗???;

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
      if (openP > cdp) signals.push("? > CDP (" + openP + " > " + Math.round(cdp*100)/100 + ")嚗?憭?);
      else signals.push("? < CDP (" + openP + " < " + Math.round(cdp*100)/100 + ")嚗?蝛?);

      if (openP >= ah) signals.push("?蝒 AH嚗??賢撥?餈賣撞");
      else if (openP <= al) signals.push("?頝 AL嚗?Ｗ摹??征");
    }
    
    if (price >= ah) signals.push("閫詨? AH嚗?脣鈭?");
    else if (price >= nh) signals.push("蝒 NH嚗蝺都暺?);

    if (price <= al) signals.push("閫詨? AL嚗雿雿?");
    else if (price <= nl) signals.push("頝 NL嚗蝺眺暺?);
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
  let status = "銝??;
  
  let lastClose = closeSeries[closeSeries.length - 1];
  let prevClose = closeSeries[closeSeries.length - 2];
  let prevHigh = highSeries[highSeries.length - 2];
  let prevLow = lowSeries[lowSeries.length - 2];
  let prevOpen = openSeries[openSeries.length - 2];
  
  let changePct = ((lastClose - prevClose) / prevClose) * 100;
  
  let amplitude = 0;
  if (prevOpen > 0) amplitude = (prevHigh - prevLow) / prevOpen;
  
  if (amplitude >= 0.03 && amplitude <= 0.08) { score += 20; signals.push("?瘜Ｗ??拐葉 (" + Math.round(amplitude * 100) + "%)"); }
  else if (amplitude > 0.08) { score += 5; signals.push("?瘜Ｗ???"); }
  else { score -= 10; signals.push("?瘜Ｗ???"); }

  let volAvg = sma(volumeSeries.slice(-6, -1), 5)[4] || 1;
  let currVol = volumeSeries[volumeSeries.length - 1];
  let volRatio = currVol / volAvg;
  
  if (volRatio > 1.5) { score += 15; signals.push("??曉之??嗆?"); }
  
  if (isLimitUp) { score += 20; signals.push("撘瑕?撞??(?瘝???"); status = "撘瑕?瘝?; }
  else if (changePct >= 7) { score += 15; signals.push("瞍脣???%嚗??賢撥"); }
  
  let cdp = cdpRes.CDP, ah = cdpRes.AH, nh = cdpRes.NH;
  if (lastClose >= ah) { score += 10; signals.push("?嗥蝒 AH嚗扔撘瑕"); }
  else if (lastClose >= cdp) { score += 5; signals.push("?嗥蝡? CDP嚗?憭?); }
  
  if (score >= 60) status = "撘瑕?瘝?;
  else if (score >= 40) status = "?瑞瘝???;
  
  return { score: Math.max(0, score), status, signals };
}

function evaluateOpeningChecklist(intradaySnapshot) {
  if (!intradaySnapshot || !intradaySnapshot.open) return null;
  let score = 50;
  let status = "銝剜?;
  let signals = [];
  
  if (intradaySnapshot.price < intradaySnapshot.open) {
    signals.push("閫貊撘瑕?箏璇辣");
    status = "蝡韏唬犖";
    score = 20;
  } else if (intradaySnapshot.price > intradaySnapshot.open) {
    signals.push("?韏圈?");
    status = "蝚血?閫撖?;
    score = 60;
  }
  
  return { score, status, signals, details: [] };
}

function calculateEntryStrategy(closeSeries, volSeries, upper, middle, intradaySnapshot, isEtf, currentPe, currentYield, ma20Series, ma60Series, bias20Series, chipNetBuy) {
  let close = closeSeries[closeSeries.length - 1];
  let volAvg = sma(volSeries.slice(-6, -1), 5)[4] || 1;
  let volRatio = volSeries[volSeries.length - 1] / volAvg;
  
  let ma20 = ma20Series[ma20Series.length - 1];
  let ma60 = ma60Series[ma60Series.length - 1];
  let bias20 = bias20Series[bias20Series.length - 1];
  let netBuy3d = chipNetBuy.slice(-3).reduce((a, b) => a + b, 0);
  
  let strategy = "銝剜扯???;
  let entryRange = "撱箄降蝑???;
  let stopLoss = Math.round(close * 0.93 * 100) / 100;
  let takeProfit = Math.round(close * 1.1 * 100) / 100;
  let strategyNotes = ["??桃???隢鞈??蝑(??4蝑???"];
  let exitRule = "頝隞??寞???暺??;
  let canEnter = false;
  
  if (isEtf) {
    strategy = "摰?摰? / 憭扯??雿?";
    entryRange = "銝?閮剝?雿?嚗??摰眺?脫?憭扯??Ⅳ";
    strategyNotes = [
      "?拙?憭批???/摮??,
      "?賣?????◢?芯蒂撟喳??",
      "?嗅??渲擃???10~20%?臬??寥脣?踵"
    ];
    exitRule = "?瑞???嚗??犖鞎∪?閬??箏";
    canEnter = true;
    stopLoss = "???瑞?摮)";
  } else {
    let goodFundamentals = false;
    if (currentPe > 0 && currentPe < 15) {
      strategyNotes.push("?祉?瘥?雿??琿蝺摯?澆??);
      goodFundamentals = true;
    }
    if (currentYield >= 5.0) {
      strategyNotes.push("畾?之??%嚗Ｖ?撣?擐");
      goodFundamentals = true;
    }
    if (netBuy3d > 0) {
      strategyNotes.push("餈?瘜犖??鞎瑁?嚗??其蜓????擃?);
    }

    if (close > ma60 && close <= ma60 * 1.05 && ma20 > ma60) {
      strategy = "?銵鞎琿?";
      entryRange = `摮???舀??? (${Math.round(ma60 * 100) / 100}) 隡箸??脣`;
      stopLoss = Math.round(ma60 * 0.98 * 100) / 100;
      strategyNotes.push("憭?澆?銝剖?瑼迤蝺?舀?");
      canEnter = true;
    } else if (bias20 > 8) {
      strategy = "甇???ａ?憭?;
      entryRange = "?剔??嚗?撱箄降餈賡?";
      strategyNotes.push("?剔??湔撞???嚗捆???潛?拐?蝯?);
      canEnter = false;
    } else if (bias20 < -8) {
      strategy = "鞎??ａ?憭?;
      entryRange = `?曉 ${close} ???雿`;
      strategyNotes.push("?剔??亥?撠鞎??ａ?憭改?摰寞??箇??");
      canEnter = true;
    } else if (close >= upper[upper.length - 1] * 0.98 && volRatio > 1.3) {
      strategy = "撘瑕蝒";
      entryRange = "?曉?脣";
      stopLoss = Math.round(close * 0.95 * 100) / 100;
      strategyNotes.push("撣園?蝒嚗?瞏?");
      canEnter = true;
    } else if (goodFundamentals && close < ma20) {
      strategy = "?孵潔?隡啣???;
      entryRange = `??銝?嚗遣霅啁???${Math.round(close * 0.95 * 100) / 100} ?鞎琿深;
      canEnter = true;
    }
    
    if (intradaySnapshot && intradaySnapshot.open) {
      if (close < intradaySnapshot.open) {
        strategy = "蝡???;
        entryRange = "閫??;
        canEnter = false;
        strategyNotes.push("!!! 撌脰??港??仿??文嚗泵?撥?嗅?湔?隞?!!!");
      }
    }
  }
  
  return { 
    strategy, 
    entry_range: entryRange, 
    stop_loss: stopLoss, 
    take_profit: takeProfit, 
    strategy_notes: strategyNotes, 
    exit_rule: exitRule,
    can_enter: canEnter
  };
}

export function analyzeStockData(payload) {
  const { stock_id, stock_name, category, price_data, chip_data, margin_data, per_data, intraday } = payload;
  
  if (!price_data || price_data.length < 35) {
    return { error: "鞈?銝雲" };
  }

  // Parse fundamental data
  let currentPe = 15.0;
  let currentYield = 4.0;
  let currentRoe = 10.0;
  if (per_data && per_data.length > 0) {
    let latestPer = per_data[per_data.length - 1];
    currentPe = latestPer.PER || 15.0;
    currentYield = latestPer.dividend_yield || 0.0;
    if (latestPer.PER > 0 && latestPer.PBR > 0) {
      // Approximate ROE = (P/B) / (P/E) * 100
      currentRoe = (latestPer.PBR / latestPer.PER) * 100;
      currentRoe = Math.round(currentRoe * 100) / 100;
    }
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
  
  let isEtf = categoryStr.includes("ETF") || stock_name.includes("ETF") || stock_id.startsWith("00");
  
  let stRes = evaluateShortTerm(closeSeries, volumeSeries, false, false);
  let stratRes = calculateEntryStrategy(closeSeries, volumeSeries, bb.upper, bb.middle, intraday, isEtf, currentPe, currentYield, ma20, ma60, bias20, chipNetBuy);
  let cdpRes = calculateCdp(highSeries, lowSeries, closeSeries, intraday, dateSeries[lastIdx]);
  let openingChecklist = evaluateOpeningChecklist(intraday);
  
  let bottomFishingRes = evaluateBottomFishing(closeSeries, chipNetBuy, openSeries, highSeries, lowSeries, volumeSeries);
  let stBurstRes = evaluateShortTermBurst(closeSeries, chipNetBuy, openSeries, highSeries, lowSeries, volumeSeries);
  let dayTradeCdpRes = evaluateDayTradeCdp(closeSeries, changePct >= 9.7, changePct <= -9.7, cdpRes, volumeSeries, highSeries, lowSeries, openSeries);

  let diag = [];
  // 1. ??閮箸
  if (lastClose > ma60[lastIdx]) diag.push("??閮箸嚗?銝迤蝺??蝺?");
  if (ma5[lastIdx] > ma10[lastIdx] && ma10[lastIdx] > ma20[lastIdx]) diag.push("??閮箸嚗銝剜??????剜???);
  
  // 2. K蝺???雿?
  let recentHigh20 = Math.max(...highSeries.slice(Math.max(0, highSeries.length - 20)));
  if (lastClose >= recentHigh20 * 0.98) diag.push("雿?閮箸嚗??啣?擃?(" + Math.round(recentHigh20*100)/100 + ")");
  
  // 3. MACD 閮箸
  if (macd.macdHist[lastIdx] > 0 && macd.macdHist[prevIdx] <= 0) diag.push("MACD閮箸嚗??勗?蝧餌?嚗?撘瑁???);
  else if (macd.macdHist[lastIdx] > 0) diag.push("MACD閮箸嚗雁???寞撅");
  else diag.push("MACD閮箸嚗征?寞撅");

  // 4. 頞典撘瑕漲 (DMI)
  if (dmi.adx[lastIdx] > 25) diag.push("頞典蝣箄?嚗?撘瑕頞典 (ADX=" + Math.round(dmi.adx[lastIdx]*10)/10 + ")");
  else if (dmi.adx[lastIdx] < 20) diag.push("?斗?孵噩嚗?隅?Ｖ??Ⅱ嚗遣霅啗???(ADX=" + Math.round(dmi.adx[lastIdx]*10)/10 + ")");

  // 5. 銋?那??  if (bias20[lastIdx] > 5) diag.push("銋?之 (20MA嚗? + Math.round(bias20[lastIdx]*10)/10 + "%)嚗餈賡?");
  else if (bias20[lastIdx] < -5) diag.push("頞都閮? (20MA嚗? + Math.round(bias20[lastIdx]*10)/10 + "%)嚗????");

  // 6. 撟渡?閮箸
  if (ma240[lastIdx]) {
    if (lastClose > ma240[lastIdx]) diag.push("?瑞?頞典?? (蝡?撟渡?)");
    else diag.push("?瑞?頞典?摹 (撟渡?銋?)");
  }

  // 7. ?支葉瑼Ｘ
  if (openingChecklist) {
    if (openingChecklist.score >= 40) diag.push("?瑼Ｘ嚗? + openingChecklist.status + " (" + openingChecklist.score + "??");
    if (openingChecklist.signals.includes("閫貊撘瑕?箏璇辣")) diag.push("!!! 霅血?嚗?寡??湧??文嚗??游?蝝敺???!!!");
  }

  // 8. 蝑?DP閮?
  if (bottomFishingRes.score >= 50) diag.push("??閮?嚗? + bottomFishingRes.status);
  if (stBurstRes.score >= 60) diag.push("?剔??嚗? + stBurstRes.status);
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
    stock_name: stock_name || "?芰璅?", 
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
    macd: macd.macdHist[lastIdx] > 0 ? "憭" : "蝛箸",
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
    pe: currentPe,
    yield: currentYield,
    roe: currentRoe,
    debt_ratio: 50.0,
    entry_range: stratRes.entry_range,
    stop_loss: stratRes.stop_loss,
    take_profit: stratRes.take_profit,
    strategy_name: stratRes.strategy,
    can_enter: stratRes.can_enter,
    strategy_notes: stratRes.strategy_notes,
    overnight: { score: 0, status: "N/A", signals: [] },
    short_term_rec: evaluateShortTermRecommendation(closeSeries, volumeSeries, chipNetBuy),
    cdp: cdpRes,
    day_trade_cdp_rec: dayTradeCdpRes,
    low_pe_rec: { score: 40, status: "?芷?璇辣", signals: [] },
    bottom_fishing_rec: bottomFishingRes,
    short_term_burst_rec: stBurstRes,
    etf_rec: { score: 0, status: "?TF", signals: [] },
    opening_checklist: openingChecklist,
    volume_patterns: [],
    entry_notes: [],
    exit_rule: stratRes.exit_rule,
    chart_data: chartData
  };
}
