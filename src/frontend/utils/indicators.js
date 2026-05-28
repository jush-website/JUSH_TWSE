// 為了確保與 Pandas 完全一致，這裡手刻相容 Pandas 的指標公式

export function sma(series, window) {
  let result = [];
  for (let i = 0; i < series.length; i++) {
    if (i < window - 1) {
      result.push(null);
    } else {
      let sum = 0;
      for (let j = 0; j < window; j++) {
        sum += series[i - j];
      }
      result.push(sum / window);
    }
  }
  return result;
}

export function ewma(series, span) {
  const alpha = 2 / (span + 1);
  let result = [];
  let currentEma = series[0];
  result.push(currentEma);
  for (let i = 1; i < series.length; i++) {
    if (series[i] !== null && !isNaN(series[i])) {
      currentEma = series[i] * alpha + currentEma * (1 - alpha);
    }
    result.push(currentEma);
  }
  return result;
}

export function calculateMacd(closeSeries, fast = 12, slow = 26, signal = 9) {
  const emaFast = ewma(closeSeries, fast);
  const emaSlow = ewma(closeSeries, slow);
  let macdLine = [];
  for (let i = 0; i < closeSeries.length; i++) {
    macdLine.push(emaFast[i] - emaSlow[i]);
  }
  const macdSignal = ewma(macdLine, signal);
  let macdHist = [];
  for (let i = 0; i < closeSeries.length; i++) {
    macdHist.push(macdLine[i] - macdSignal[i]);
  }
  return { macdLine, macdSignal, macdHist };
}

export function calculateRsi(closeSeries, window = 14) {
  let gain = [];
  let loss = [];
  for (let i = 1; i < closeSeries.length; i++) {
    let diff = closeSeries[i] - closeSeries[i - 1];
    gain.push(diff > 0 ? diff : 0);
    loss.push(diff < 0 ? -diff : 0);
  }
  
  // Pandas RSI usually uses SMA or Wilder's Smoothing.
  // The python code uses: rolling(window).mean() for both gain and loss
  let avgGain = sma(gain, window);
  let avgLoss = sma(loss, window);
  
  let rsi = [null]; // 補齊長度
  for (let i = 0; i < avgGain.length; i++) {
    if (avgLoss[i] === 0) {
      rsi.push(100);
    } else if (avgLoss[i] === null) {
      rsi.push(null);
    } else {
      let rs = avgGain[i] / avgLoss[i];
      rsi.push(100 - (100 / (1 + rs)));
    }
  }
  return rsi;
}

export function calculateKd(highSeries, lowSeries, closeSeries, n = 9, m1 = 3, m2 = 3) {
  let rsv = [];
  for (let i = 0; i < closeSeries.length; i++) {
    if (i < n - 1) {
      rsv.push(50); // 預設值
    } else {
      let highest = Math.max(...highSeries.slice(i - n + 1, i + 1));
      let lowest = Math.min(...lowSeries.slice(i - n + 1, i + 1));
      let diff = highest - lowest;
      if (diff === 0) diff = 1e-9;
      rsv.push(((closeSeries[i] - lowest) / diff) * 100);
    }
  }

  // KD uses EWMA with adjust=False
  // Pandas: rsv.fillna(50).ewm(com=m1-1, adjust=False).mean()
  // span = 2*com + 1
  let k = ewma(rsv, 2 * (m1 - 1) + 1);
  let d = ewma(k, 2 * (m2 - 1) + 1);
  
  return { k, d };
}

export function calculateBollingerBands(closeSeries, window = 20, numStd = 2) {
  let middle = sma(closeSeries, window);
  let upper = [];
  let lower = [];
  
  for (let i = 0; i < closeSeries.length; i++) {
    if (i < window - 1) {
      upper.push(null);
      lower.push(null);
    } else {
      let slice = closeSeries.slice(i - window + 1, i + 1);
      let mean = middle[i];
      let sumSq = 0;
      for (let val of slice) {
        sumSq += Math.pow(val - mean, 2);
      }
      // Sample std deviation (Pandas default ddof=1)
      let std = Math.sqrt(sumSq / (window - 1));
      upper.push(mean + numStd * std);
      lower.push(mean - numStd * std);
    }
  }
  return { upper, middle, lower };
}

export function calculateAtr(highSeries, lowSeries, closeSeries, window = 14) {
  let tr = [highSeries[0] - lowSeries[0]]; // 第一天
  for (let i = 1; i < closeSeries.length; i++) {
    let hl = highSeries[i] - lowSeries[i];
    let hc = Math.abs(highSeries[i] - closeSeries[i - 1]);
    let lc = Math.abs(lowSeries[i] - closeSeries[i - 1]);
    tr.push(Math.max(hl, hc, lc));
  }
  return sma(tr, window);
}

export function calculateDmi(highSeries, lowSeries, closeSeries, window = 14) {
  let plusDm = [0];
  let minusDm = [0];
  for (let i = 1; i < closeSeries.length; i++) {
    let upMove = highSeries[i] - highSeries[i - 1];
    let downMove = lowSeries[i - 1] - lowSeries[i];
    if (upMove > downMove && upMove > 0) {
      plusDm.push(upMove);
    } else {
      plusDm.push(0);
    }
    if (downMove > upMove && downMove > 0) {
      minusDm.push(downMove);
    } else {
      minusDm.push(0);
    }
  }
  
  let atr = calculateAtr(highSeries, lowSeries, closeSeries, window);
  let avgPlusDm = sma(plusDm, window);
  let avgMinusDm = sma(minusDm, window);
  
  let plusDi = [];
  let minusDi = [];
  let dx = [];
  for (let i = 0; i < atr.length; i++) {
    if (atr[i] === null) {
      plusDi.push(null);
      minusDi.push(null);
      dx.push(null);
    } else {
      let pdi = 100 * (avgPlusDm[i] / (atr[i] + 1e-9));
      let mdi = 100 * (avgMinusDm[i] / (atr[i] + 1e-9));
      plusDi.push(pdi);
      minusDi.push(mdi);
      dx.push(100 * Math.abs(pdi - mdi) / (pdi + mdi + 1e-9));
    }
  }
  
  let adx = sma(dx, window);
  return { plusDi, minusDi, adx };
}

export function calculateObv(closeSeries, volumeSeries) {
  let obv = [volumeSeries[0]];
  for (let i = 1; i < closeSeries.length; i++) {
    if (closeSeries[i] > closeSeries[i - 1]) {
      obv.push(obv[i - 1] + volumeSeries[i]);
    } else if (closeSeries[i] < closeSeries[i - 1]) {
      obv.push(obv[i - 1] - volumeSeries[i]);
    } else {
      obv.push(obv[i - 1]);
    }
  }
  return obv;
}

export function calculateAd(highSeries, lowSeries, closeSeries, volumeSeries) {
  let ad = [0];
  let sum = 0;
  for (let i = 0; i < closeSeries.length; i++) {
    let mf = ((closeSeries[i] - lowSeries[i]) - (highSeries[i] - closeSeries[i])) / (highSeries[i] - lowSeries[i] + 1e-9);
    let vol = mf * volumeSeries[i];
    sum += vol;
    ad[i] = sum;
  }
  return ad;
}
