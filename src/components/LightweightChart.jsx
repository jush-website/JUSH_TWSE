import React, { useEffect, useRef } from 'react';
import { createChart, CrosshairMode } from 'lightweight-charts';

const LightweightChart = ({ data }) => {
  const chartContainerRef = useRef(null);
  const macdContainerRef = useRef(null);
  const chartRef = useRef(null);
  const macdChartRef = useRef(null);
  const legendRef = useRef(null);

  useEffect(() => {
    if (!data || data.length === 0 || !chartContainerRef.current || !macdContainerRef.current) return;

    // Ensure data is sorted by time and filter out invalid data
    const validData = data.filter(d => d.time && d.close !== undefined && !isNaN(d.close));
    const sortedData = [...validData].sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime());

    // Deduplicate and format time to 'YYYY-MM-DD'
    const uniqueData = [];
    let lastTime = null;
    for (const d of sortedData) {
      const timeStr = typeof d.time === 'string' ? d.time.split('T')[0].split(' ')[0] : d.time;
      if (timeStr !== lastTime) {
        uniqueData.push({ ...d, time: timeStr });
        lastTime = timeStr;
      }
    }

    const candleData = uniqueData.map(d => ({
      time: d.time,
      open: d.open !== undefined ? d.open : d.close,
      high: d.high !== undefined ? d.high : d.close,
      low: d.low !== undefined ? d.low : d.close,
      close: d.close,
    }));

    const volumeData = uniqueData.map(d => ({
      time: d.time,
      value: d.volume || 0,
      color: d.close >= (d.open !== undefined ? d.open : d.close) ? 'rgba(239, 83, 80, 0.5)' : 'rgba(38, 166, 154, 0.5)' // Red for up, green for down in TW
    }));

    const ma5Data = uniqueData.filter(d => d.ma5 !== null && d.ma5 !== undefined).map(d => ({ time: d.time, value: d.ma5 }));
    const ma10Data = uniqueData.filter(d => d.ma10 !== null && d.ma10 !== undefined).map(d => ({ time: d.time, value: d.ma10 }));
    const ma20Data = uniqueData.filter(d => d.ma20 !== null && d.ma20 !== undefined).map(d => ({ time: d.time, value: d.ma20 }));

    const macdLineData = uniqueData.map(d => ({ time: d.time, value: d.macd_line || 0 }));
    const macdSignalData = uniqueData.map(d => ({ time: d.time, value: d.macd_signal || 0 }));
    const macdHistData = uniqueData.map(d => ({
      time: d.time,
      value: d.macd_hist || 0,
      color: (d.macd_hist || 0) >= 0 ? 'rgba(239, 83, 80, 0.8)' : 'rgba(38, 166, 154, 0.8)'
    }));

    // --- Main Chart (Price + Volume) ---
    const chart = createChart(chartContainerRef.current, {
      autoSize: true,
      layout: { background: { type: 'solid', color: 'transparent' }, textColor: '#d1d5db' },
      grid: { vertLines: { color: '#374151' }, horzLines: { color: '#374151' } },
      crosshair: { mode: CrosshairMode.Normal },
      rightPriceScale: { borderColor: '#4b5563' },
      timeScale: { borderColor: '#4b5563', timeVisible: false },
    });
    chartRef.current = chart;

    try {
      const candleSeries = chart.addCandlestickSeries({
        upColor: '#ef5350', downColor: '#26a69a', borderVisible: false, wickUpColor: '#ef5350', wickDownColor: '#26a69a'
      });
      candleSeries.setData(candleData);

      const volumeSeries = chart.addHistogramSeries({
        priceFormat: { type: 'volume' },
        priceScaleId: '', // overlay
      });
      volumeSeries.priceScale().applyOptions({ scaleMargins: { top: 0.8, bottom: 0 } });
      volumeSeries.setData(volumeData);

      // --- Main Chart MA Series ---
      const ma5Series = chart.addLineSeries({ color: '#E5C100', lineWidth: 1.5, title: '5MA', crosshairMarkerVisible: false });
      ma5Series.setData(ma5Data);
      const ma10Series = chart.addLineSeries({ color: '#26C6DA', lineWidth: 1.5, title: '10MA', crosshairMarkerVisible: false });
      ma10Series.setData(ma10Data);
      const ma20Series = chart.addLineSeries({ color: '#D81B60', lineWidth: 1.5, title: '20MA', crosshairMarkerVisible: false });
      ma20Series.setData(ma20Data);

      // --- MACD Chart ---
      const macdChart = createChart(macdContainerRef.current, {
        autoSize: true,
        layout: { background: { type: 'solid', color: 'transparent' }, textColor: '#d1d5db' },
        grid: { vertLines: { color: '#374151' }, horzLines: { color: '#374151' } },
        crosshair: { mode: CrosshairMode.Normal },
        rightPriceScale: { borderColor: '#4b5563' },
        timeScale: { borderColor: '#4b5563', visible: true, timeVisible: false },
      });
      macdChartRef.current = macdChart;

      const macdHistSeries = macdChart.addHistogramSeries({
        priceFormat: { type: 'custom', formatter: price => price.toFixed(3) },
      });
      macdHistSeries.setData(macdHistData);

      const macdLineSeries = macdChart.addLineSeries({ color: '#2962FF', lineWidth: 2 });
      macdLineSeries.setData(macdLineData);

      const macdSignalSeries = macdChart.addLineSeries({ color: '#FF6D00', lineWidth: 2 });
      macdSignalSeries.setData(macdSignalData);

      // Function to render legend
      const renderLegend = (data, vol, ma5, ma10, ma20) => {
        if (legendRef.current && data) {
          const change = data.close - data.open;
          const pct = ((change / data.open) * 100).toFixed(2);
          const colorClass = change >= 0 ? 'text-red-400' : 'text-green-400';
          legendRef.current.innerHTML = `
            <span>開 <span class="font-bold">${data.open.toFixed(2)}</span></span>
            <span>高 <span class="font-bold">${data.high.toFixed(2)}</span></span>
            <span>低 <span class="font-bold">${data.low.toFixed(2)}</span></span>
            <span>收 <span class="font-bold">${data.close.toFixed(2)}</span></span>
            <span>量 <span class="font-bold">${(vol?.value || 0).toLocaleString()}</span></span>
            <span class="${colorClass} font-bold whitespace-nowrap">${change > 0 ? '+' : ''}${change.toFixed(2)} (${change > 0 ? '+' : ''}${pct}%)</span>
            ${ma5 !== undefined ? `<span class="ml-2 text-[#E5C100]">MA5: <span class="font-bold">${ma5.toFixed(2)}</span></span>` : ''}
            ${ma10 !== undefined ? `<span class="text-[#26C6DA]">MA10: <span class="font-bold">${ma10.toFixed(2)}</span></span>` : ''}
            ${ma20 !== undefined ? `<span class="text-[#D81B60]">MA20: <span class="font-bold">${ma20.toFixed(2)}</span></span>` : ''}
          `;
        }
      };

      // Set initial legend to the last candle
      if (candleData.length > 0) {
        const lastData = uniqueData[uniqueData.length - 1];
        renderLegend(lastData, { value: lastData.volume }, lastData.ma5, lastData.ma10, lastData.ma20);
      }

      // --- Sync Charts ---
      chart.subscribeCrosshairMove(param => {
        if (!param.time) return;
        macdChart.setCrosshairPosition(param.price, param.time, macdHistSeries);
        const data = param.seriesData.get(candleSeries);
        const vol = param.seriesData.get(volumeSeries);
        const ma5Val = param.seriesData.get(ma5Series);
        const ma10Val = param.seriesData.get(ma10Series);
        const ma20Val = param.seriesData.get(ma20Series);
        if (data) {
          renderLegend(data, vol, ma5Val?.value, ma10Val?.value, ma20Val?.value);
        }
      });
      macdChart.subscribeCrosshairMove(param => {
        if (!param.time) return;
        chart.setCrosshairPosition(param.price, param.time, candleSeries);
        // MACD chart crosshair move doesn't return candle series data directly via param,
        // so we don't update legend here to keep it simple, or we could find it by time.
      });

      chart.timeScale().subscribeVisibleLogicalRangeChange(range => {
        if (range) macdChart.timeScale().setVisibleLogicalRange(range);
      });
      macdChart.timeScale().subscribeVisibleLogicalRangeChange(range => {
        if (range) chart.timeScale().setVisibleLogicalRange(range);
      });

      chart.timeScale().fitContent();
    } catch (err) {
      chartContainerRef.current.innerHTML = `<div style="color:red; padding:20px;">Chart Error: ${err.message}</div>`;
      console.error(err);
    }

    return () => {
      if (chartRef.current) {
        chartRef.current.remove();
        chartRef.current = null;
      }
      if (macdChartRef.current) {
        macdChartRef.current.remove();
        macdChartRef.current = null;
      }
    };
  }, [data]);

  return (
    <div className="w-full flex flex-col gap-2">
      <div className="w-full relative bg-gray-800/80 rounded-2xl border border-gray-700/50 p-4 pt-14 sm:pt-4 shadow-xl">
        <h2 className="text-sm font-bold text-gray-300 absolute top-4 left-6 z-10 hidden sm:block">價格與成交量</h2>
        <div ref={legendRef} className="absolute top-4 left-4 sm:left-32 z-10 text-[11px] sm:text-xs font-mono text-gray-300 flex flex-wrap items-center gap-x-2 sm:gap-x-3 gap-y-1 pr-2"></div>
        <div ref={chartContainerRef} className="w-full h-[250px] sm:h-[280px]" />
      </div>
      <div className="w-full relative bg-gray-800/80 rounded-2xl border border-gray-700/50 p-4 shadow-xl">
        <h2 className="text-sm font-bold text-gray-300 absolute top-4 left-6 z-10">MACD指標</h2>
        <div ref={macdContainerRef} className="w-full h-[180px]" />
      </div>
    </div>
  );
};

export default LightweightChart;
