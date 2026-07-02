import React, { useRef } from 'react';
import gsap from 'gsap';
import { useGSAP } from '@gsap/react';

/**
 * react-bits 風格 BlurText：文字逐段從模糊淡入。
 * 以空白切詞（中文標題通常是一整段，會以整段淡入，仍有效果）。
 */
export default function BlurText({ text = '', className = '', stagger = 0.05, as: Tag = 'span' }) {
  const ref = useRef(null);

  useGSAP(() => {
    const nodes = ref.current?.querySelectorAll('.blur-word');
    if (!nodes || nodes.length === 0) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    gsap.fromTo(nodes,
      { opacity: 0, filter: 'blur(8px)', y: 6 },
      {
        opacity: 1, filter: 'blur(0px)', y: 0,
        duration: 0.5, ease: 'power2.out', stagger,
        clearProps: 'filter,transform,opacity',
      }
    );
  }, { scope: ref, dependencies: [text] });

  const words = String(text).split(/(\s+)/);
  return (
    <Tag ref={ref} className={className}>
      {words.map((w, i) =>
        /^\s+$/.test(w)
          ? w
          : <span key={i} className="blur-word inline-block">{w}</span>
      )}
    </Tag>
  );
}
