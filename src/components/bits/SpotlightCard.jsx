import React, { useRef, useCallback } from 'react';

/**
 * react-bits 風格 Spotlight 卡片：滑鼠移動時卡片內浮現柔光。
 * 純 CSS 變數實作，無額外重繪負擔；觸控裝置（hover:none）由 CSS 直接停用。
 */
export default function SpotlightCard({
  children,
  className = '',
  spotlightColor = 'hsl(var(--brand) / 0.10)',
  ...props
}) {
  const ref = useRef(null);

  const handleMouseMove = useCallback((e) => {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    el.style.setProperty('--spot-x', `${e.clientX - rect.left}px`);
    el.style.setProperty('--spot-y', `${e.clientY - rect.top}px`);
  }, []);

  return (
    <div
      ref={ref}
      onMouseMove={handleMouseMove}
      className={`spotlight-card ${className}`}
      {...props}
    >
      <div
        className="spotlight-overlay"
        aria-hidden="true"
        style={{
          background: `radial-gradient(240px circle at var(--spot-x, 50%) var(--spot-y, 50%), ${spotlightColor}, transparent 70%)`,
        }}
      />
      {children}
    </div>
  );
}
