import re

# 1. CapitalFlowHeatmap.jsx
path_cap = 'src/pages/CapitalFlowHeatmap.jsx'
with open(path_cap, 'r', encoding='utf-8') as f:
    text = f.read()

text = text.replace("if (selectedIndustry && containerRef.current) {",
"""if (data && data.length > 0) {
      gsap.from('.gsap-heatmap-block', { scale: 0.8, opacity: 0, duration: 0.5, stagger: 0.05, ease: "back.out(1.2)" });
    }
    if (selectedIndustry && containerRef.current) {""")

text = text.replace("transition-all duration-300 hover:scale-[1.02]", "gsap-heatmap-block transition-colors duration-300 hover:scale-[1.02]")

with open(path_cap, 'w', encoding='utf-8') as f:
    f.write(text)

# 2. MacroDashboard.jsx
path_mac = 'src/pages/MacroDashboard.jsx'
with open(path_mac, 'r', encoding='utf-8') as f:
    text = f.read()

if "import gsap from 'gsap';" not in text:
    text = text.replace("import ProgressLoader from '../components/ProgressLoader';", 
                        "import ProgressLoader from '../components/ProgressLoader';\nimport gsap from 'gsap';\nimport { useGSAP } from '@gsap/react';")

macro_hooks = """
  const containerRef = React.useRef(null);
  useGSAP(() => {
    if (!loading) {
      gsap.from('.gsap-macro-card', { y: 30, opacity: 0, duration: 0.6, stagger: 0.15, ease: "power2.out" });
    }
  }, { scope: containerRef, dependencies: [loading] });

  if (loading)"""
text = text.replace("  if (loading)", macro_hooks)

text = text.replace('return (\n    <div className="space-y-6 max-w-7xl mx-auto pb-12">',
                    'return (\n    <div ref={containerRef} className="space-y-6 max-w-7xl mx-auto pb-12">')

text = text.replace('className="bg-gray-800/80', 'className="gsap-macro-card bg-gray-800/80')

with open(path_mac, 'w', encoding='utf-8') as f:
    f.write(text)

# 3. Derivatives.jsx
path_der = 'src/pages/Derivatives.jsx'
with open(path_der, 'r', encoding='utf-8') as f:
    text = f.read()

if "import gsap from 'gsap';" not in text:
    text = text.replace("import ProgressLoader from '../components/ProgressLoader';", 
                        "import ProgressLoader from '../components/ProgressLoader';\nimport gsap from 'gsap';\nimport { useGSAP } from '@gsap/react';")

der_hooks = """
  const containerRef = React.useRef(null);
  useGSAP(() => {
    if (!loading) {
      gsap.from('.gsap-derivative-card', { y: 30, opacity: 0, duration: 0.6, stagger: 0.15, ease: "power2.out" });
    }
  }, { scope: containerRef, dependencies: [loading] });

  if (loading)"""
text = text.replace("  if (loading)", der_hooks)

text = text.replace('return (\n    <div className="space-y-6">',
                    'return (\n    <div ref={containerRef} className="space-y-6">')

text = text.replace('className="bg-gray-800', 'className="gsap-derivative-card bg-gray-800')

with open(path_der, 'w', encoding='utf-8') as f:
    f.write(text)

print('Done')
