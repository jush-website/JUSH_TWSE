import re

path = 'src/pages/CapitalFlowHeatmap.jsx'
with open(path, 'r', encoding='utf-8') as f:
    text = f.read()

# 1. Remove the misplaced hooks
misplaced_hooks = """  const containerRef = React.useRef(null);
  
  useGSAP(() => {
    if (selectedIndustry) {
      gsap.fromTo('.gsap-modal-overlay', { opacity: 0 }, { opacity: 1, duration: 0.3 });
      gsap.fromTo('.gsap-modal-content', { scale: 0.8, y: 50, opacity: 0 }, { scale: 1, y: 0, opacity: 1, duration: 0.5, ease: "back.out(1.5)" });
    }
  }, { scope: containerRef, dependencies: [selectedIndustry] });

"""
text = text.replace(misplaced_hooks, '')

# 2. Add the hooks before early returns
top_hooks = """
  const containerRef = React.useRef(null);
  
  useGSAP(() => {
    if (selectedIndustry && containerRef.current) {
      gsap.fromTo('.gsap-modal-overlay', { opacity: 0 }, { opacity: 1, duration: 0.3 });
      gsap.fromTo('.gsap-modal-content', { scale: 0.8, y: 50, opacity: 0 }, { scale: 1, y: 0, opacity: 1, duration: 0.5, ease: "back.out(1.5)" });
    }
  }, { scope: containerRef, dependencies: [selectedIndustry] });

  if (loading) return ("""

text = text.replace('  if (loading) return (', top_hooks)

with open(path, 'w', encoding='utf-8') as f:
    f.write(text)

print('Fixed CapitalFlowHeatmap hooks')
