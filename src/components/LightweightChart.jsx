import React, { useEffect, useRef } from 'react';
import { createChart, CrosshairMode } from 'lightweight-charts';

const LightweightChart = ({ data }) => {
  const chartContainerRef = useRef(null);
  const macdContainerRef = useRef(null);
  const chartRef = useRef(null);
  const macdChartRef = useRef(null);

  useEffect(() => {
    if (!data || data.length === 0 || !chartContainerRef.current || !macdContainerRef.current) return;

    // --- Format Data ---
    // Ensure data is sorted by time and filter out invalid data
    const validData = data.filter(d => d.time && d.close !== undefined);
    const sortedData = [...validData].sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime());

    const candleData = sortedData.map(d => ({
      time: d.time,
      open: d.open || d.close,
      high: d.high || d.close,
      low: d.low || d.close,
      close: d.close,
    }));

    const volumeData = sortedData.map(d => ({
      time: d.time,
      value: d.volume || 0,
      color: d.close >= (d.open || d.close) ? 'rgba(38, 166, 154, 0.5)' : 'rgba(239, 83, 80, 0.5)'
    }));

    const macdLineData = sortedData.map(d => ({ time: d.time, value: d.macd_line || 0 }));
    const macdSignalData = sortedData.map(d => ({ time: d.time, value: d.macd_signal || 0 }));
    const macdHistData = sortedData.map(d => ({
      time: d.time,
      value: d.macd_hist || 0,
      color: (d.macd_hist || 0) >= 0 ? 'rgba(38, 166, 154, 0.8)' : 'rgba(239, 83, 80, 0.8)'
    }));

    // --- Main Chart (Price + Volume) ---
    const chart = createChart(chartContainerRef.current, {
      layout: { background: { type: 'solid', color: 'transparent' }, textColor: '#d1d5db' },
      grid: { vertLines: { color: '#374151' }, horzLines: { color: '#374151' } },
      crosshair: { mode: CrosshairMode.Normal },
      rightPriceScale: { borderColor: '#4b5563' },
      timeScale: { borderColor: '#4b5563', timeVisible: false },
    });
    chartRef.current = chart;

    const candleSeries = chart.addCandlestickSeries({
      upColor: '#26a69a', downColor: '#ef5350', borderVisible: false, wickUpColor: '#26a69a', wickDownColor: '#ef5350'
    });
    candleSeries.setData(candleData);

    const volumeSeries = chart.addHistogramSeries({
      priceFormat: { type: 'volume' },
      priceScaleId: '', // overlay
    });
    volumeSeries.priceScale().applyOptions({ scaleMargins: { top: 0.8, bottom: 0 } });
    volumeSeries.setData(volumeData);

    // --- MACD Chart ---
    const macdChart = createChart(macdContainerRef.current, {
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

    // --- Sync Charts ---
    chart.subscribeCrosshairMove(param => {
      if (!param.time) return;
      macdChart.setCrosshairPosition(param.price, param.time, macdHistSeries);
    });
    macdChart.subscribeCrosshairMove(param => {
      if (!param.time) return;
      chart.setCrosshairPosition(param.price, param.time, candleSeries);
    });

    chart.timeScale().subscribeVisibleLogicalRangeChange(range => {
      if (range) macdChart.timeScale().setVisibleLogicalRange(range);
    });
    macdChart.timeScale().subscribeVisibleLogicalRangeChange(range => {
      if (range) chart.timeScale().setVisibleLogicalRange(range);
    });

    // Handle Resize
    const handleResize = () => {
      if (chartContainerRef.current && macdContainerRef.current) {
        chart.applyOptions({ width: chartContainerRef.current.clientWidth });
        macdChart.applyOptions({ width: macdContainerRef.current.clientWidth });
      }
    };
    window.addEventListener('resize', handleResize);
    chart.timeScale().fitContent();

    return () => {
      window.removeEventListener('resize', handleResize);
      chart.remove();
      macdChart.remove();
    };
  }, [data]);

  return (
    <div className="w-full flex flex-col gap-2">
      <div className="w-full relative bg-gray-800/80 rounded-2xl border border-gray-700/50 p-4 shadow-xl">
        <h2 className="text-sm font-bold text-gray-300 absolute top-4 left-6 z-10">價格與成交量</h2>
        <div ref={chartContainerRef} className="w-full h-[280px]" />
      </div>
      <div className="w-full relative bg-gray-800/80 rounded-2xl border border-gray-700/50 p-4 shadow-xl">
        <h2 className="text-sm font-bold text-gray-300 absolute top-4 left-6 z-10">MACD指標</h2>
        <div ref={macdContainerRef} className="w-full h-[180px]" />
      </div>
    </div>
  );
};

export default LightweightChart;
