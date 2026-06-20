import React, { memo } from 'react';
import { AdvancedChart } from 'react-ts-tradingview-widgets';

const TradingViewWidget = ({ symbol }) => {
  return (
    <div style={{ width: '100%', height: '100%' }}>
      <AdvancedChart
        widgetProps={{
          symbol: symbol,
          theme: "dark",
          interval: "D",
          timezone: "Asia/Taipei",
          locale: "zh_TW",
          style: "1",
          allow_symbol_change: true,
          autosize: true,
          hide_side_toolbar: false,
          hide_top_toolbar: false,
          hide_legend: false,
          hide_volume: false,
          studies: [
            "STD;Bollinger_Bands",
            "STD;MACD"
          ]
        }}
      />
    </div>
  );
};

export default memo(TradingViewWidget);
