import React, { useState } from 'react';
import { Layers, Activity, Users } from 'lucide-react';
import CapitalFlowHeatmap from './CapitalFlowHeatmap';
import MarketBreadth from './MarketBreadth';
import InstitutionalFlow from './InstitutionalFlow';

const CapitalFlow = () => {
  const [activeTab, setActiveTab] = useState('heatmap');

  return (
    <div className="space-y-6 animate-fade-in pb-10">
      {/* Tab Navigation */}
      <div className="flex flex-wrap items-center space-x-2 sm:space-x-4 border-b border-gray-700/80 pb-4 mb-4">
        <button
          onClick={() => setActiveTab('heatmap')}
          className={`flex items-center space-x-2 px-4 py-2 rounded-xl font-bold transition-all duration-300 ${
            activeTab === 'heatmap' 
              ? 'bg-orange-500/20 text-orange-400 border border-orange-500/50 shadow-[0_0_15px_rgba(249,115,22,0.3)]' 
              : 'bg-gray-800/50 text-gray-400 hover:bg-gray-700 hover:text-gray-200 border border-transparent'
          }`}
        >
          <Layers size={18} />
          <span>資金板塊 (Heatmap)</span>
        </button>
        <button
          onClick={() => setActiveTab('market-breadth')}
          className={`flex items-center space-x-2 px-4 py-2 rounded-xl font-bold transition-all duration-300 ${
            activeTab === 'market-breadth' 
              ? 'bg-purple-500/20 text-purple-400 border border-purple-500/50 shadow-[0_0_15px_rgba(168,85,247,0.3)]' 
              : 'bg-gray-800/50 text-gray-400 hover:bg-gray-700 hover:text-gray-200 border border-transparent'
          }`}
        >
          <Activity size={18} />
          <span>大盤多空分布</span>
        </button>
        <button
          onClick={() => setActiveTab('institutional')}
          className={`flex items-center space-x-2 px-4 py-2 rounded-xl font-bold transition-all duration-300 ${
            activeTab === 'institutional' 
              ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/50 shadow-[0_0_15px_rgba(16,185,129,0.3)]' 
              : 'bg-gray-800/50 text-gray-400 hover:bg-gray-700 hover:text-gray-200 border border-transparent'
          }`}
        >
          <Users size={18} />
          <span>三大法人動向</span>
        </button>
      </div>

      {/* Tab Content */}
      <div className="w-full">
        {activeTab === 'heatmap' && <CapitalFlowHeatmap />}
        {activeTab === 'market-breadth' && <MarketBreadth />}
        {activeTab === 'institutional' && <InstitutionalFlow />}
      </div>
    </div>
  );
};

export default CapitalFlow;
