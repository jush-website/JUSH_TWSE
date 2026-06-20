import re
import os

# --- Dashboard.jsx ---
path = "src/pages/Dashboard.jsx"
with open(path, "r", encoding="utf-8") as f:
    text = f.read()

text = text.replace("import ProgressLoader from '../components/ProgressLoader';",
"""import ProgressLoader from '../components/ProgressLoader';
import gsap from 'gsap';
import { useGSAP } from '@gsap/react';""")

hooks = """  const containerRef = React.useRef(null);
  
  useGSAP(() => {
    if (!loading) {
      gsap.from('.gsap-dashboard-card', {
        y: 30, opacity: 0, duration: 0.8, stagger: 0.1, ease: "power3.out"
      });
    }
  }, { scope: containerRef, dependencies: [loading] });

  if (loading) return <ProgressLoader text="正在載入最新市場概況..." />;"""

text = text.replace("  if (loading) return <ProgressLoader text=\"正在載入最新市場概況...\" />;", hooks)

text = text.replace('return (\n    <div className="space-y-5 sm:space-y-8">',
                    'return (\n    <div ref={containerRef} className="space-y-5 sm:space-y-8">')

text = text.replace('<section className={`bg-gradient-to-br', '<section className={`gsap-dashboard-card bg-gradient-to-br')
text = text.replace('<div className="bg-gradient-to-br from-yellow-900', '<div className="gsap-dashboard-card bg-gradient-to-br from-yellow-900')
text = text.replace('className="bg-gray-800 p-3 sm:p-4 rounded-lg', 'className="gsap-dashboard-card bg-gray-800 p-3 sm:p-4 rounded-lg')
text = text.replace('className="block bg-gray-800 p-3 sm:p-4 rounded-xl', 'className="gsap-dashboard-card block bg-gray-800 p-3 sm:p-4 rounded-xl')

with open(path, "w", encoding="utf-8") as f:
    f.write(text)


# --- RecommendationPage.jsx ---
path = "src/pages/RecommendationPage.jsx"
with open(path, "r", encoding="utf-8") as f:
    text = f.read()

text = text.replace("import ProgressLoader from '../components/ProgressLoader';",
"""import ProgressLoader from '../components/ProgressLoader';
import gsap from 'gsap';
import { useGSAP } from '@gsap/react';""")

hooks = """  const containerRef = React.useRef(null);

  useGSAP(() => {
    if (!loading && stocks.length > 0) {
      gsap.from('.gsap-recommend-card', {
        y: 40, opacity: 0, duration: 0.8, stagger: 0.15, ease: "back.out(1.2)"
      });
    }
  }, { scope: containerRef, dependencies: [loading, stocks] });

  if (loading) return <ProgressLoader text={`正在分析${strategyInfo.title}標的...`} />;"""

text = text.replace("  if (loading) return <ProgressLoader text={`正在分析${strategyInfo.title}標的...`} />;", hooks)

text = text.replace('return (\n    <div className="space-y-6">',
                    'return (\n    <div ref={containerRef} className="space-y-6">')

text = text.replace('className="bg-gray-800 rounded-2xl p-4', 'className="gsap-recommend-card bg-gray-800 rounded-2xl p-4')

with open(path, "w", encoding="utf-8") as f:
    f.write(text)

print("Added GSAP to Dashboard and RecommendationPage")
