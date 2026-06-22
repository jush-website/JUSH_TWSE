import React, { useState } from 'react';
import { Layers, Activity, Users } from 'lucide-react';
import CapitalFlowHeatmap from './CapitalFlowHeatmap';
import MarketDistribution from './MarketDistribution';
import InstitutionalFlow from './InstitutionalFlow';

const TABS = [
  { id: 'heatmap',             label: '資金板塊',    icon: Layers   },
  { id: 'market-distribution', label: '大盤多空分布', icon: Activity },
  { id: 'institutional',       label: '三大法人',    icon: Users    },
];

const CapitalFlow = () => {
  const [activeTab, setActiveTab] = useState('heatmap');

  return (
    <div className="space-y-5 pb-10">
      {/* Tab rail */}
      <div className="bg-panel border border-line rounded-xl p-1 flex gap-0.5 w-full sm:w-fit overflow-x-auto no-scrollbar">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setActiveTab(id)}
            className={`flex items-center gap-1.5 sm:gap-2 px-2.5 sm:px-4 py-1.5 sm:py-2 rounded-lg text-xs sm:text-sm font-medium transition-all duration-150 whitespace-nowrap flex-1 sm:flex-none justify-center ${
              activeTab === id
                ? 'bg-brand text-brand-fg shadow-sm'
                : 'text-ink-2 hover:text-ink-1 hover:bg-overlay'
            }`}
          >
            <Icon size={14} />
            {label}
          </button>
        ))}
      </div>

      <div className="w-full">
        {activeTab === 'heatmap'             && <CapitalFlowHeatmap />}
        {activeTab === 'market-distribution' && <MarketDistribution />}
        {activeTab === 'institutional'       && <InstitutionalFlow />}
      </div>
    </div>
  );
};

export default CapitalFlow;
