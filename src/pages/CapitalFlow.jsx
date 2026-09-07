import { lazy, Suspense, useState } from 'react';
import { Layers, Activity, Users } from 'lucide-react';
import ProgressLoader from '../components/ProgressLoader';

// 三個分頁一次只看得到一個，但其中兩個各自扛著一份 recharts。
// 改成用到才載，進頁面時只下載預設分頁需要的程式碼。
// React.lazy 本身沒有預抓的入口，所以額外把 loader 掛成 preload，
// 讓滑鼠移到分頁鈕時就能先開始下載。
const lazyPanel = (load) => Object.assign(lazy(load), { preload: load });

const CapitalFlowHeatmap = lazyPanel(() => import('./CapitalFlowHeatmap'));
const MarketDistribution = lazyPanel(() => import('./MarketDistribution'));
const InstitutionalFlow  = lazyPanel(() => import('./InstitutionalFlow'));

const TABS = [
  { id: 'heatmap',             label: '資金板塊',    icon: Layers,   Panel: CapitalFlowHeatmap },
  { id: 'market-distribution', label: '大盤多空分布', icon: Activity, Panel: MarketDistribution },
  { id: 'institutional',       label: '三大法人',    icon: Users,    Panel: InstitutionalFlow  },
];

const CapitalFlow = () => {
  const [activeTab, setActiveTab] = useState('heatmap');
  const ActivePanel = TABS.find(t => t.id === activeTab)?.Panel;

  // 滑過/點到分頁時就先把該分頁的 chunk 抓下來，切換當下不必等網路。
  const prefetch = (id) => { TABS.find(t => t.id === id)?.Panel.preload(); };

  return (
    <div className="space-y-5 pb-10">
      {/* Tab rail */}
      <div className="bg-panel border border-line rounded-xl p-1 flex gap-0.5 w-full sm:w-fit overflow-x-auto no-scrollbar">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setActiveTab(id)}
            onMouseEnter={() => prefetch(id)}
            onFocus={() => prefetch(id)}
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
        <Suspense fallback={<ProgressLoader text="正在載入分頁內容..." />}>
          {ActivePanel && <ActivePanel />}
        </Suspense>
      </div>
    </div>
  );
};

export default CapitalFlow;
