import { useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";

/** Tekenvlak voor een handtekening met vinger, pen of muis. Geeft een PNG data-URL terug (of null als leeg). */
export function SignaturePad({ onChange }: { onChange: (dataUrl: string | null) => void }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const hasInk = useRef(false);

  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const ratio = window.devicePixelRatio || 1;
    c.width = c.offsetWidth * ratio;
    c.height = c.offsetHeight * ratio;
    const ctx = c.getContext("2d");
    if (!ctx) return;
    ctx.scale(ratio, ratio);
    ctx.lineWidth = 2.5;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = getComputedStyle(c).getPropertyValue("--signature-ink").trim();
  }, []);

  function pos(e: React.PointerEvent<HTMLCanvasElement>) {
    const r = e.currentTarget.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  function clear() {
    const c = ref.current;
    if (!c) return;
    c.getContext("2d")?.clearRect(0, 0, c.width, c.height);
    hasInk.current = false;
    onChange(null);
  }

  return (
    <div className="space-y-2">
      <canvas
        ref={ref}
        aria-label="Teken je handtekening"
        className="w-full h-40 rounded-md border border-border bg-signature-paper touch-none"
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          drawing.current = true;
          const ctx = e.currentTarget.getContext("2d");
          if (!ctx) return;
          const p = pos(e);
          ctx.beginPath();
          ctx.moveTo(p.x, p.y);
          ctx.lineTo(p.x + 0.1, p.y + 0.1);
          ctx.stroke();
        }}
        onPointerMove={(e) => {
          if (!drawing.current) return;
          const ctx = e.currentTarget.getContext("2d");
          if (!ctx) return;
          const p = pos(e);
          ctx.lineTo(p.x, p.y);
          ctx.stroke();
          hasInk.current = true;
        }}
        onPointerUp={(e) => {
          if (!drawing.current) return;
          drawing.current = false;
          hasInk.current = true;
          onChange(e.currentTarget.toDataURL("image/png"));
        }}
        onPointerCancel={(e) => {
          drawing.current = false;
          if (hasInk.current) onChange(e.currentTarget.toDataURL("image/png"));
        }}
      />
      <div className="flex justify-between text-xs text-muted-foreground">
        <span>Teken je handtekening met je vinger in het witte vak.</span>
        <Button type="button" size="sm" variant="ghost" onClick={clear}>Wissen</Button>
      </div>
    </div>
  );
}
