import React, { useState } from 'react';
import { Layers, Activity, Users } from 'lucide-react';
import CapitalFlowHeatmap from './CapitalFlowHeatmap';
import MarketDistribution from './MarketDistribution';
import InstitutionalFlow from './InstitutionalFlow';

const TABS = [
  { id: 'heatmap',              label: '資金板塊',    icon: Layers   },
  { id: 'market-distribution',  label: '大盤多空分布', icon: Activity },
  { id: 'institutional',        label: '三大法人',    icon: Users    },
];

const CapitalFlow = () => {
  const [activeTab, setActiveTab] = useState('heatmap');

  return (
    <div className="space-y-6 pb-10">
      {/* Tab rail — single accent (blue), consistent across all tabs */}
      <div className="bg-gray-800/60 backdrop-blur-sm border border-gray-700/50 rounded-2xl p-1.5 flex gap-1 w-full sm:w-fit">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setActiveTab(id)}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-all duration-200 whitespace-nowrap ${
              activeTab === id
                ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/20'
                : 'text-gray-400 hover:text-gray-200 hover:bg-gray-700/50'
            }`}
          >
            <Icon size={15} />
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
