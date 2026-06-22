import { useRef } from 'react';
import gsap from 'gsap';
import { useGSAP } from '@gsap/react';

/**
 * Sequential card-reveal animation. Each card animates one after another
 * (slight overlap so total time stays bounded) instead of all at once,
 * which avoids the compositor jank seen on large grids.
 */
export function useCardAnimation(selector, deps, {
  enabled = true,
  stagger = 0.07,
  maxStaggerTotal = 1.8,
  duration = 0.38,
  y = 14,
  ease = 'power2.out',
} = {}) {
  const containerRef = useRef(null);

  useGSAP(() => {
    if (!enabled) return;
    const els = containerRef.current?.querySelectorAll(selector);
    if (!els || els.length === 0) return;

    // Cap per-card stagger so very large grids don't take forever
    const count = els.length;
    const cappedStagger = Math.min(stagger, maxStaggerTotal / Math.max(count - 1, 1));

    // Hide first paint, then reveal sequentially. Transform-only (no scale)
    // keeps each frame compositor-only and avoids paint storms.
    gsap.set(els, { opacity: 0, y, force3D: true, willChange: 'transform, opacity' });

    gsap.to(els, {
      opacity: 1,
      y: 0,
      duration,
      ease,
      stagger: cappedStagger,
      force3D: true,
      overwrite: 'auto',
      onComplete: () => {
        gsap.set(els, { clearProps: 'willChange,transform,opacity' });
      },
    });
  }, { scope: containerRef, dependencies: deps });

  return containerRef;
}
