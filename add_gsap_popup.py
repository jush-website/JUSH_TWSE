import re

path = "src/pages/CapitalFlowHeatmap.jsx"
with open(path, "r", encoding="utf-8") as f:
    text = f.read()

text = text.replace("import LightweightChart from '../components/LightweightChart';",
"""import LightweightChart from '../components/LightweightChart';
import gsap from 'gsap';
import { useGSAP } from '@gsap/react';""")

hooks = """  const containerRef = React.useRef(null);
  
  useGSAP(() => {
    if (selectedIndustry) {
      gsap.fromTo('.gsap-modal-overlay', { opacity: 0 }, { opacity: 1, duration: 0.3 });
      gsap.fromTo('.gsap-modal-content', { scale: 0.8, y: 50, opacity: 0 }, { scale: 1, y: 0, opacity: 1, duration: 0.5, ease: "back.out(1.5)" });
    }
  }, { scope: containerRef, dependencies: [selectedIndustry] });"""

text = text.replace("  // Calculate Heatmap Data", hooks + "\n\n  // Calculate Heatmap Data")

text = text.replace('return (\n    <div className="space-y-4">',
                    'return (\n    <div ref={containerRef} className="space-y-4">')

# Modify Modal
modal_old = """      <div className={`lg:hidden fixed inset-0 z-50 flex items-center justify-center p-4 transition-all duration-300 ${selectedIndustry ? 'opacity-100 visible' : 'opacity-0 invisible'}`}>
        <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setSelectedIndustry(null)}></div>
        <div className={`bg-gray-900 rounded-2xl border border-gray-700 p-5 relative z-10 w-full max-w-md max-h-[85vh] overflow-y-auto transform transition-transform duration-300 shadow-2xl ${selectedIndustry ? 'scale-100 translate-y-0' : 'scale-95 translate-y-10'}`}>"""

modal_new = """      <div className={`lg:hidden fixed inset-0 z-50 flex items-center justify-center p-4 ${selectedIndustry ? 'visible' : 'invisible'}`}>
        <div className="gsap-modal-overlay absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setSelectedIndustry(null)}></div>
        <div className="gsap-modal-content bg-gray-900 rounded-2xl border border-gray-700 p-5 relative z-10 w-full max-w-md max-h-[85vh] overflow-y-auto shadow-2xl">"""

text = text.replace(modal_old, modal_new)

with open(path, "w", encoding="utf-8") as f:
    f.write(text)

print("Added GSAP to CapitalFlowHeatmap.jsx")
