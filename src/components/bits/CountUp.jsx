import React, { useRef, useEffect } from 'react';
import gsap from 'gsap';

const prefersReducedMotion = () =>
  typeof window !== 'undefined' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * react-bits 風格數字滾動元件。
 * 首次掛載從 0 滾動到目標值；之後值變動（例如盤中即時報價刷新）
 * 從前一個值平滑滾動到新值，讓價格跳動有「即時感」而非閃變。
 */
export default function CountUp({
  value,
  decimals,
  duration = 0.8,
  className = '',
  prefix = '',
  suffix = '',
}) {
  const ref = useRef(null);
  const prevRef = useRef(null);
  const num = typeof value === 'number' ? value : parseFloat(value);
  const valid = Number.isFinite(num);

  // 未指定小數位時依原始值推斷（上限 3 位；長尾浮點如 46744.16015625 請由呼叫端指定 decimals）
  const dec = decimals ?? (valid && !Number.isInteger(num)
    ? Math.min((String(value).split('.')[1] || '').length, 3)
    : 0);

  const fmt = (v) =>
    prefix + v.toLocaleString('zh-TW', { minimumFractionDigits: dec, maximumFractionDigits: dec }) + suffix;

  useEffect(() => {
    if (!valid || !ref.current) return;
    if (prefersReducedMotion()) {
      ref.current.textContent = fmt(num);
      prevRef.current = num;
      return;
    }
    const from = prevRef.current ?? 0;
    prevRef.current = num;
    if (from === num) {
      ref.current.textContent = fmt(num);
      return;
    }
    const obj = { v: from };
    const tween = gsap.to(obj, {
      v: num,
      duration,
      ease: 'power2.out',
      onUpdate: () => {
        if (ref.current) ref.current.textContent = fmt(obj.v);
      },
    });
    return () => tween.kill();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [num, valid]);

  if (!valid) return <span className={className}>{value ?? '--'}</span>;
  return (
    <span ref={ref} className={`nums ${className}`}>
      {fmt(num)}
    </span>
  );
}
