import { useRef } from 'react';
import gsap from 'gsap';
import { useGSAP } from '@gsap/react';

export function useCardAnimation(selector, deps, {
  enabled = true,
  stagger = 0.1,
  maxStaggerTotal = 1,
  ...fromProps
} = {}) {
  const containerRef = useRef(null);

  useGSAP(() => {
    if (!enabled) return;
    const els = containerRef.current?.querySelectorAll(selector);
    if (!els || els.length === 0) return;
    const cappedStagger = Math.min(stagger, maxStaggerTotal / Math.max(els.length - 1, 1));
    gsap.from(els, {
      y: 30, opacity: 0, duration: 0.6, ease: 'power2.out',
      ...fromProps,
      stagger: cappedStagger,
    });
  }, { scope: containerRef, dependencies: deps });

  return containerRef;
}
