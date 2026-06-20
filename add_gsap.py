import re

file_path = "src/pages/StockAnalysis.jsx"
with open(file_path, "r", encoding="utf-8") as f:
    text = f.read()

# Add imports
text = text.replace("import LightweightChart from '../components/LightweightChart';",
"""import LightweightChart from '../components/LightweightChart';
import gsap from 'gsap';
import { useGSAP } from '@gsap/react';""")

# Add useGSAP hooks
hooks_code = """  const isPositive = data?.change_percent >= 0;

  const containerRef = React.useRef(null);

  useGSAP(() => {
    if (data) {
      gsap.from('.gsap-card', {
        y: 30,
        opacity: 0,
        duration: 0.8,
        stagger: 0.15,
        ease: "power3.out"
      });
      const scoreObj = { val: 0 };
      gsap.to(scoreObj, {
        val: data.total_score || 0,
        duration: 1.5,
        ease: "power2.out",
        onUpdate: () => {
          const el = document.querySelector('.gsap-score');
          if (el) el.innerHTML = Math.round(scoreObj.val);
        }
      });
    }
  }, { scope: containerRef, dependencies: [data] });

  useGSAP(() => {
    if (data) {
      gsap.fromTo('.gsap-tab-content', 
        { opacity: 0, y: 15 },
        { opacity: 1, y: 0, duration: 0.4, ease: "power2.out" }
      );
    }
  }, { scope: containerRef, dependencies: [activeTab] });"""

text = text.replace("  const isPositive = data?.change_percent >= 0;", hooks_code)

# Add containerRef
text = text.replace('<div className="max-w-6xl mx-auto space-y-4 sm:space-y-6">',
                    '<div ref={containerRef} className="max-w-6xl mx-auto space-y-4 sm:space-y-6">')

# Add gsap-card to main sections
text = text.replace('<div className="bg-gray-800/80 backdrop-blur-xl rounded-2xl border border-gray-700/50 p-4 sm:p-6 shadow-2xl hover:border-blue-500/30 transition-all duration-500 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 sm:gap-6">',
                    '<div className="gsap-card bg-gray-800/80 backdrop-blur-xl rounded-2xl border border-gray-700/50 p-4 sm:p-6 shadow-2xl hover:border-blue-500/30 transition-all duration-500 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 sm:gap-6">')

text = text.replace('<div className="flex space-x-2 overflow-x-auto bg-gray-800 p-2 rounded-2xl border border-gray-700 shadow-xl scrollbar-hide">',
                    '<div className="gsap-card flex space-x-2 overflow-x-auto bg-gray-800 p-2 rounded-2xl border border-gray-700 shadow-xl scrollbar-hide">')

# Add gsap-score to the score element
score_old = """                <div className={`text-3xl sm:text-5xl font-black ${
                  data.total_score >= 70 ? 'text-red-500' : 
                  data.total_score >= 50 ? 'text-orange-500' : 'text-gray-400'
                }`}>"""
score_new = """                <div className={`gsap-score text-3xl sm:text-5xl font-black ${
                  data.total_score >= 70 ? 'text-red-500' : 
                  data.total_score >= 50 ? 'text-orange-500' : 'text-gray-400'
                }`}>"""
text = text.replace(score_old, score_new)

# Add gsap-tab-content to all activeTab containers
text = re.sub(r'\{activeTab === \'([a-z]+)\' && \(\s*<div className="space-y-4 sm:space-y-6">',
              r"{activeTab === '\1' && (\n            <div className=\"gsap-tab-content space-y-4 sm:space-y-6\">",
              text)

with open(file_path, "w", encoding="utf-8") as f:
    f.write(text)

print("Added GSAP to StockAnalysis.jsx")
