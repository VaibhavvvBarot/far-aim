import { useEffect, useRef, useState } from 'preact/hooks';
import type { ComponentChildren } from 'preact';

// A sheet that slides up, and can be dragged down (or tapped outside, or Esc) to close.
export function Sheet({ onClose, label, children, wide = false, tall = false }: {
  onClose: () => void; label: string; children: ComponentChildren | ((close: () => void) => ComponentChildren); wide?: boolean; tall?: boolean;
}) {
  const panel = useRef<HTMLDivElement>(null);
  const [closing, setClosing] = useState(false);
  const drag = useRef<{ y: number; dy: number; t: number } | null>(null);

  const close = () => {
    if (closing) return;
    setClosing(true);
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
    setTimeout(onClose, reduce ? 0 : 200);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); close(); } };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [closing]);

  // Drag down from the grabber/header (or anywhere when the content is scrolled to the top)
  const onStart = (e: TouchEvent) => {
    const scroller = (e.target as HTMLElement).closest('.sheet-scroll') as HTMLElement | null;
    if (scroller && scroller.scrollTop > 0) return;
    drag.current = { y: e.touches[0].clientY, dy: 0, t: Date.now() };
  };
  const onMove = (e: TouchEvent) => {
    const d = drag.current;
    if (!d || !panel.current) return;
    d.dy = Math.max(0, e.touches[0].clientY - d.y);
    if (d.dy > 4) {
      panel.current.style.transition = 'none';
      panel.current.style.transform = `translateY(${d.dy}px)`;
      if (e.cancelable) e.preventDefault();
    }
  };
  const onEnd = () => {
    const d = drag.current;
    drag.current = null;
    if (!d || !panel.current) return;
    const fast = d.dy / Math.max(1, Date.now() - d.t) > 0.6;
    panel.current.style.transition = '';
    if (d.dy > 110 || (fast && d.dy > 30)) close();
    else panel.current.style.transform = '';
  };

  return (
    <div class={'sheet-backdrop' + (closing ? ' closing' : '')} onClick={(e) => { if (e.target === e.currentTarget) close(); }}>
      <div ref={panel} class={'sheet-panel' + (wide ? ' wide' : '') + (tall ? ' tall' : '') + (closing ? ' closing' : '')} role="dialog" aria-modal="true" aria-label={label}
        onTouchStart={onStart as any} onTouchMove={onMove as any} onTouchEnd={onEnd} onTouchCancel={onEnd}>
        <div class="grabber" aria-hidden="true" />
        {typeof children === 'function' ? (children as any)(close) : children}
      </div>
    </div>
  );
}
