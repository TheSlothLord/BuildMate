import { useEffect, useRef, useState } from 'react';
import type { DeckLayout } from '../model/types';
import { DeckCanvas } from './DeckCanvas';
import { saveFile } from '../platform/save';

interface Props {
  layout: DeckLayout;
  endGap: number;
  onClose: () => void;
}

interface T {
  scale: number;
  x: number;
  y: number;
}

const MIN = 0.3;
const MAX = 16;

export function ZoomView({ layout, endGap, onClose }: Props) {
  const [t, setT] = useState<T>({ scale: 1, x: 0, y: 0 });
  const stageRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinchDist = useRef<number | null>(null);

  // Close on Escape.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const zoomAt = (prev: T, px: number, py: number, factor: number): T => {
    const scale = clamp(prev.scale * factor, MIN, MAX);
    const k = scale / prev.scale;
    return { scale, x: px - (px - prev.x) * k, y: py - (py - prev.y) * k };
  };

  const stagePoint = (clientX: number, clientY: number) => {
    const r = stageRef.current!.getBoundingClientRect();
    return { x: clientX - r.left, y: clientY - r.top };
  };

  const onWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const p = stagePoint(e.clientX, e.clientY);
    setT((prev) => zoomAt(prev, p.x, p.y, e.deltaY < 0 ? 1.12 : 1 / 1.12));
  };

  const onPointerDown = (e: React.PointerEvent) => {
    (e.target as Element).setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const pts = pointers.current;
    if (!pts.has(e.pointerId)) return;
    const prevPt = pts.get(e.pointerId)!;

    if (pts.size === 1) {
      const dx = e.clientX - prevPt.x;
      const dy = e.clientY - prevPt.y;
      setT((p) => ({ ...p, x: p.x + dx, y: p.y + dy }));
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    } else if (pts.size >= 2) {
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      const [a, b] = [...pts.values()];
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      const mid = stagePoint((a.x + b.x) / 2, (a.y + b.y) / 2);
      if (pinchDist.current != null && pinchDist.current > 0) {
        const factor = dist / pinchDist.current;
        setT((prev) => zoomAt(prev, mid.x, mid.y, factor));
      }
      pinchDist.current = dist;
    }
  };

  const onPointerUp = (e: React.PointerEvent) => {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) pinchDist.current = null;
  };

  const zoomButton = (factor: number) => {
    const r = stageRef.current!.getBoundingClientRect();
    setT((prev) => zoomAt(prev, r.width / 2, r.height / 2, factor));
  };

  const reset = () => setT({ scale: 1, x: 0, y: 0 });

  const savePng = async () => {
    const svg = contentRef.current?.querySelector('svg');
    if (!svg) return;
    const blob = await svgToPngBlob(svg as SVGSVGElement, 2);
    const name = (layout.label || 'deck').replace(/[^a-z0-9_-]+/gi, '-').toLowerCase();
    await saveFile(`${name}-plan.png`, blob);
  };

  return (
    <div className="zoom-overlay" role="dialog" aria-label={`${layout.label} plan`}>
      <div className="zoom-toolbar">
        <strong>{layout.label}</strong>
        <span className="grow" />
        <button onClick={() => zoomButton(1 / 1.3)} title="Zoom out">−</button>
        <button onClick={() => zoomButton(1.3)} title="Zoom in">＋</button>
        <button onClick={reset} title="Reset zoom">Reset</button>
        <button onClick={savePng} title="Save the plan as a PNG image">🖼 PNG</button>
        <button onClick={onClose} title="Close">✕</button>
      </div>
      <div
        className="zoom-stage"
        ref={stageRef}
        onWheel={onWheel}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        <div
          ref={contentRef}
          className="zoom-content"
          style={{ transform: `translate(${t.x}px, ${t.y}px) scale(${t.scale})` }}
        >
          <DeckCanvas layout={layout} endGap={endGap} />
        </div>
      </div>
      <div className="zoom-hint">Pinch or scroll to zoom · drag to pan</div>
    </div>
  );
}

function clamp(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v));
}

/** Rasterize an SVG (with CSS variables resolved) to a PNG blob at `scale`×. */
async function svgToPngBlob(svg: SVGSVGElement, scale: number): Promise<Blob> {
  const cs = getComputedStyle(document.documentElement);
  const vb = svg.viewBox.baseVal;
  const w = vb && vb.width ? vb.width : svg.clientWidth || 800;
  const h = vb && vb.height ? vb.height : svg.clientHeight || 600;

  const clone = svg.cloneNode(true) as SVGSVGElement;
  clone.removeAttribute('style');
  clone.setAttribute('width', String(w));
  clone.setAttribute('height', String(h));

  let s = new XMLSerializer().serializeToString(clone);
  // Resolve CSS custom properties (var(--x)) to concrete colors for standalone render.
  s = s.replace(/var\((--[a-z0-9-]+)\)/gi, (_m, name) => cs.getPropertyValue(name).trim() || '#000');

  const svgUrl = URL.createObjectURL(new Blob([s], { type: 'image/svg+xml;charset=utf-8' }));
  try {
    const img = new Image();
    await new Promise<void>((res, rej) => {
      img.onload = () => res();
      img.onerror = () => rej(new Error('svg load failed'));
      img.src = svgUrl;
    });
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(w * scale);
    canvas.height = Math.round(h * scale);
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = cs.getPropertyValue('--bg').trim() || '#14130f';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    return await new Promise<Blob>((res, rej) =>
      canvas.toBlob((b) => (b ? res(b) : rej(new Error('toBlob failed'))), 'image/png'),
    );
  } finally {
    URL.revokeObjectURL(svgUrl);
  }
}
