import React, { useEffect, useRef, memo } from 'react';

function TradingViewWidget({ symbol }) {
  const container = useRef();

  useEffect(
    () => {
      // Clear previous chart to avoid duplicates on re-render
      if (container.current) {
        container.current.innerHTML = '';
      }

      const script = document.createElement("script");
      script.src = "https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js";
      script.type = "text/javascript";
      script.async = true;
      script.innerHTML = `
        {
          "allow_symbol_change": true,
          "calendar": false,
          "details": true,
          "hide_side_toolbar": true,
          "hide_top_toolbar": false,
          "hide_legend": false,
          "hide_volume": false,
          "hotlist": false,
          "interval": "D",
          "locale": "zh_TW",
          "save_image": true,
          "style": "1",
          "symbol": "${symbol}",
          "theme": "dark",
          "timezone": "Asia/Taipei",
          "backgroundColor": "#0F0F0F",
          "gridColor": "rgba(242, 242, 242, 0.06)",
          "watchlist": [],
          "withdateranges": false,
          "compareSymbols": [],
          "studies": [
            "STD;Bollinger_Bands",
            "STD;MACD"
          ],
          "autosize": true
        }`;
      if (container.current) {
        container.current.appendChild(script);
      }
    },
    [symbol]
  );

  return (
    <div className="tradingview-widget-container" ref={container} style={{ height: "100%", width: "100%" }}>
    </div>
  );
}

export default memo(TradingViewWidget);
