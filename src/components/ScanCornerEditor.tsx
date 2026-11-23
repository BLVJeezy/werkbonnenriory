import { useEffect, useRef, useState } from 'react';
import { isConvexQuad, type LoadedScanSource, type Quad } from '@/lib/document-scan';

const LABELS = ['Linksboven', 'Rechtsboven', 'Rechtsonder', 'Linksonder'] as const;

/** Interactieve 4-hoekenbijsnijder met vloeiende touch/muis-handles en loep/magnifier tijdens verslepen. */
export function ScanCornerEditor({
  source,
  corners,
  onChange,
}: {
  source: LoadedScanSource;
  corners: Quad;
  onChange: (next: Quad) => void;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const bgCanvasRef = useRef<HTMLCanvasElement>(null);
  const loupeCanvasRef = useRef<HTMLCanvasElement>(null);
  const [dragIdx, setDragIdx] = useState<number | null>(null);

  // Draw the source image into the display canvas once per source
  useEffect(() => {
    const c = bgCanvasRef.current;
    if (!c) return;
    c.width = source.width;
    c.height = source.height;
    const ctx = c.getContext('2d');
    if (ctx) ctx.drawImage(source.canvas, 0, 0);
  }, [source]);

  // Update magnifier loupe while dragging a corner
  useEffect(() => {
    if (dragIdx === null) return;
    const loupe = loupeCanvasRef.current;
    const pt = corners[dragIdx];
    if (!loupe || !pt) return;
    const size = 128;
    loupe.width = size;
    loupe.height = size;
    const ctx = loupe.getContext('2d');
    if (!ctx) return;
    const zoom = 2.5;
    const sampleR = size / (2 * zoom);
    ctx.fillStyle = '#111';
    ctx.fillRect(0, 0, size, size);
    ctx.drawImage(
      source.canvas,
      pt.x - sampleR,
      pt.y - sampleR,
      sampleR * 2,
      sampleR * 2,
      0,
      0,
      size,
      size,
    );
    // Precision crosshair
    ctx.strokeStyle = '#f97316';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(size / 2, 0); ctx.lineTo(size / 2, size);
    ctx.moveTo(0, size / 2); ctx.lineTo(size, size / 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(size / 2, size / 2, 5, 0, Math.PI * 2);
    ctx.stroke();
  }, [dragIdx, corners, source]);

  function clientToImage(clientX: number, clientY: number) {
    const rect = bgCanvasRef.current?.getBoundingClientRect();
    if (!rect || !rect.width || !rect.height) return null;
    const x = Math.min(source.width, Math.max(0, ((clientX - rect.left) / rect.width) * source.width));
    const y = Math.min(source.height, Math.max(0, ((clientY - rect.top) / rect.height) * source.height));
    return { x, y };
  }

  function moveCorner(idx: number, clientX: number, clientY: number) {
    const pt = clientToImage(clientX, clientY);
    if (!pt) return;
    const next = corners.map((c, i) => (i === idx ? pt : c)) as Quad;
    if (isConvexQuad(next)) onChange(next);
  }

  const pct = (x: number, max: number) => `${(x / max) * 100}%`;
  const activePt = dragIdx !== null ? corners[dragIdx] : null;
  const loupeRight = activePt ? activePt.x < source.width / 2 : true;

  return (
    <div ref={wrapRef} className="relative flex h-full w-full select-none items-center justify-center overflow-hidden bg-muted/60" style={{ touchAction: 'none' }}>
      <div className="relative max-h-full max-w-full" style={{ aspectRatio: `${source.width} / ${source.height}` }}>
        <canvas ref={bgCanvasRef} className="block h-full w-full object-contain" />
        <svg
          viewBox={`0 0 ${source.width} ${source.height}`}
          preserveAspectRatio="none"
          className="pointer-events-none absolute inset-0 h-full w-full"
        >
          <defs>
            <mask id="scan-quad-mask">
              <rect x="0" y="0" width={source.width} height={source.height} fill="white" />
              <polygon points={corners.map((p) => `${p.x},${p.y}`).join(' ')} fill="black" />
            </mask>
          </defs>
          <rect x="0" y="0" width={source.width} height={source.height} fill="rgba(0,0,0,0.48)" mask="url(#scan-quad-mask)" />
          <polygon
            points={corners.map((p) => `${p.x},${p.y}`).join(' ')}
            fill="none"
            stroke="hsl(var(--primary))"
            strokeWidth={Math.max(3, source.width * 0.004)}
          />
        </svg>
        {corners.map((pt, idx) => (
          <button
            key={idx}
            type="button"
            aria-label={`Hoekpunt ${LABELS[idx]} verslepen`}
            onPointerDown={(e) => {
              e.currentTarget.setPointerCapture(e.pointerId);
              setDragIdx(idx);
              moveCorner(idx, e.clientX, e.clientY);
            }}
            onPointerMove={(e) => {
              if (dragIdx === idx) moveCorner(idx, e.clientX, e.clientY);
            }}
            onPointerUp={() => setDragIdx(null)}
            onPointerCancel={() => setDragIdx(null)}
            className="absolute flex h-11 w-11 -translate-x-1/2 -translate-y-1/2 cursor-grab items-center justify-center rounded-full active:cursor-grabbing"
            style={{ left: pct(pt.x, source.width), top: pct(pt.y, source.height), touchAction: 'none' }}
          >
            <span className={`h-5 w-5 rounded-full border-2 border-primary-foreground shadow-md transition-transform ${dragIdx === idx ? 'scale-125 bg-primary' : 'bg-primary/90'}`} />
          </button>
        ))}
      </div>
      {dragIdx !== null && (
        <div
          className={`pointer-events-none absolute top-3 z-20 overflow-hidden rounded-full border-2 border-primary shadow-lg ${loupeRight ? 'right-3' : 'left-3'}`}
        >
          <canvas ref={loupeCanvasRef} className="block h-28 w-28" />
        </div>
      )}
    </div>
  );
}