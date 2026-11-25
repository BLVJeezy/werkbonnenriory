export type PipeColorPreset = {
  id: string;
  label: string;
  short: string;
  hex: string;
};

export const PIPE_COLORS: readonly PipeColorPreset[] = [
  { id: "dwa", label: "DWA (afvalwater)", short: "DWA", hex: "#b91c1c" },
  { id: "rwa", label: "RWA (regenwater)", short: "RWA", hex: "#1d4ed8" },
  { id: "gemengd", label: "Gemengd / infiltratie", short: "Gemengd", hex: "#15803d" },
  { id: "wachtbuis", label: "Wachtbuis / verluchting", short: "Wachtbuis", hex: "#d97706" },
  { id: "notitie", label: "Notitie / overig", short: "Zwart", hex: "#111827" },
] as const;

export type StampType =
  | "toezichtsput"
  | "septische_put"
  | "regenwaterput"
  | "infiltratie"
  | "sifonput"
  | "terugslagklep"
  | "straataansluiting"
  | "rond_deksel"
  | "vierkant_deksel"
  | "kolk"
  | "vetafscheider"
  | "pompput";

export type StampPreset = {
  id: StampType;
  label: string;
  code: string;
  shape: "square" | "circle" | "diamond" | "triangle" | "double_circle" | "double_square" | "grate";
};

export const STAMP_PRESETS: readonly StampPreset[] = [
  { id: "toezichtsput", label: "Toezichtsput", code: "TP", shape: "square" },
  { id: "septische_put", label: "Septische put", code: "SP", shape: "circle" },
  { id: "regenwaterput", label: "Regenwaterput", code: "RWP", shape: "circle" },
  { id: "pompput", label: "Pompput", code: "PMP", shape: "double_circle" },
  { id: "vetafscheider", label: "Vetafscheider", code: "VET", shape: "square" },
  { id: "infiltratie", label: "Infiltratiekrat", code: "INF", shape: "square" },
  { id: "sifonput", label: "Sifonput / reukafsnijder", code: "SIF", shape: "diamond" },
  { id: "rond_deksel", label: "Rond deksel", code: "RD", shape: "double_circle" },
  { id: "vierkant_deksel", label: "Vierkant deksel", code: "VD", shape: "double_square" },
  { id: "kolk", label: "Straatkolk / rooster", code: "KLK", shape: "grate" },
  { id: "terugslagklep", label: "Terugslagklep", code: "TSK", shape: "triangle" },
  { id: "straataansluiting", label: "Straataansluiting", code: "STR", shape: "diamond" },
] as const;

export type PlanPoint = { x: number; y: number };

export type PlanElement =
  | { kind: "stroke"; color: string; width: number; points: PlanPoint[] }
  | { kind: "line"; color: string; width: number; x1: number; y1: number; x2: number; y2: number; arrow?: boolean }
  | { kind: "stamp"; stamp: StampType; color: string; x: number; y: number; label?: string }
  | { kind: "text"; color: string; x: number; y: number; text: string };

const VALID_STAMPS = new Set<string>(STAMP_PRESETS.map((s) => s.id));

function isFiniteNum(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

/** Safely parses persisted JSONB drawing elements, dropping malformed entries. */
export function parseDrawingData(raw: unknown): PlanElement[] {
  if (!Array.isArray(raw)) return [];
  const out: PlanElement[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const rec = item as Record<string, unknown>;
    const kind = rec["kind"];
    const color = typeof rec["color"] === "string" && rec["color"].length > 0 ? rec["color"] : "#b91c1c";
    if (kind === "stroke" && Array.isArray(rec["points"])) {
      const pts: PlanPoint[] = [];
      for (const p of rec["points"]) {
        if (p && typeof p === "object" && isFiniteNum((p as Record<string, unknown>)["x"]) && isFiniteNum((p as Record<string, unknown>)["y"])) {
          pts.push({ x: (p as { x: number }).x, y: (p as { y: number }).y });
        }
      }
      const width = isFiniteNum(rec["width"]) ? Math.max(1, Math.min(20, rec["width"])) : 4;
      if (pts.length > 0) out.push({ kind: "stroke", color, width, points: pts });
    } else if (
      kind === "line" &&
      isFiniteNum(rec["x1"]) &&
      isFiniteNum(rec["y1"]) &&
      isFiniteNum(rec["x2"]) &&
      isFiniteNum(rec["y2"])
    ) {
      const width = isFiniteNum(rec["width"]) ? Math.max(1, Math.min(20, rec["width"])) : 4;
      const el: PlanElement = { kind: "line", color, width, x1: rec["x1"], y1: rec["y1"], x2: rec["x2"], y2: rec["y2"] };
      if (rec["arrow"] === true) el.arrow = true;
      out.push(el);
    } else if (
      kind === "stamp" &&
      typeof rec["stamp"] === "string" &&
      VALID_STAMPS.has(rec["stamp"]) &&
      isFiniteNum(rec["x"]) &&
      isFiniteNum(rec["y"])
    ) {
      const el: PlanElement = { kind: "stamp", stamp: rec["stamp"] as StampType, color, x: rec["x"], y: rec["y"] };
      if (typeof rec["label"] === "string" && rec["label"].trim()) el.label = rec["label"].trim();
      out.push(el);
    } else if (
      kind === "text" &&
      isFiniteNum(rec["x"]) &&
      isFiniteNum(rec["y"]) &&
      typeof rec["text"] === "string" &&
      rec["text"].trim().length > 0
    ) {
      out.push({ kind: "text", color, x: rec["x"], y: rec["y"], text: rec["text"].trim() });
    }
  }
  return out;
}

/** Finds the index of the element closest to normalized point (nx, ny) within threshold. */
export function findNearestElementIndex(elements: readonly PlanElement[], nx: number, ny: number, threshold = 0.035): number {
  let bestIdx = -1;
  let bestDist = threshold;
  for (let i = elements.length - 1; i >= 0; i--) {
    const el = elements[i];
    if (!el) continue;
    let dist = Infinity;
    if (el.kind === "stamp" || el.kind === "text") {
      dist = Math.hypot(el.x - nx, el.y - ny);
    } else if (el.kind === "line") {
      dist = pointToSegmentDist(nx, ny, el.x1, el.y1, el.x2, el.y2);
    } else if (el.kind === "stroke") {
      for (let j = 0; j < el.points.length; j++) {
        const p = el.points[j];
        if (!p) continue;
        const d = Math.hypot(p.x - nx, p.y - ny);
        if (d < dist) dist = d;
      }
    }
    if (dist < bestDist) {
      bestDist = dist;
      bestIdx = i;
    }
  }
  return bestIdx;
}

function pointToSegmentDist(px: number, py: number, x1: number, y1: number, x2: number, y2: number): number {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return Math.hypot(px - x1, py - y1);
  const t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / lenSq));
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
}

/** Draws a clean architectural graph-paper background. */
export function drawGridBackground(ctx: CanvasRenderingContext2D, w: number, h: number) {
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, w, h);
  const step = Math.max(20, Math.round(Math.min(w, h) / 28));
  ctx.strokeStyle = "#e5e7eb";
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let x = 0; x <= w; x += step) {
    ctx.moveTo(x, 0);
    ctx.lineTo(x, h);
  }
  for (let y = 0; y <= h; y += step) {
    ctx.moveTo(0, y);
    ctx.lineTo(w, y);
  }
  ctx.stroke();
}

/** Renders all normalized plan elements onto a 2D canvas context. */
export function drawPlanElements(ctx: CanvasRenderingContext2D, w: number, h: number, elements: readonly PlanElement[]) {
  const scale = Math.min(w, h) / 800;
  for (const el of elements) {
    ctx.save();
    if (el.kind === "stroke") {
      const first = el.points[0];
      if (!first) { ctx.restore(); continue; }
      ctx.strokeStyle = el.color;
      ctx.lineWidth = Math.max(1.5, el.width * scale);
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.beginPath();
      ctx.moveTo(first.x * w, first.y * h);
      for (let i = 1; i < el.points.length; i++) {
        const p = el.points[i];
        if (p) ctx.lineTo(p.x * w, p.y * h);
      }
      ctx.stroke();
    } else if (el.kind === "line") {
      const x1 = el.x1 * w;
      const y1 = el.y1 * h;
      const x2 = el.x2 * w;
      const y2 = el.y2 * h;
      ctx.strokeStyle = el.color;
      ctx.fillStyle = el.color;
      ctx.lineWidth = Math.max(1.5, el.width * scale);
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
      if (el.arrow) {
        const angle = Math.atan2(y2 - y1, x2 - x1);
        const head = Math.max(12, el.width * 3.5 * scale);
        ctx.beginPath();
        ctx.moveTo(x2, y2);
        ctx.lineTo(x2 - head * Math.cos(angle - Math.PI / 6), y2 - head * Math.sin(angle - Math.PI / 6));
        ctx.lineTo(x2 - head * Math.cos(angle + Math.PI / 6), y2 - head * Math.sin(angle + Math.PI / 6));
        ctx.closePath();
        ctx.fill();
      }
    } else if (el.kind === "stamp") {
      const preset = STAMP_PRESETS.find((s) => s.id === el.stamp) ?? STAMP_PRESETS[0]!;
      const cx = el.x * w;
      const cy = el.y * h;
      const r = Math.max(14, 18 * scale);
      ctx.fillStyle = "#ffffff";
      ctx.strokeStyle = el.color;
      ctx.lineWidth = Math.max(2, 3 * scale);
      ctx.beginPath();
      if (preset.shape === "circle" || preset.shape === "double_circle") {
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
      } else if (preset.shape === "square" || preset.shape === "double_square" || preset.shape === "grate") {
        ctx.rect(cx - r, cy - r, r * 2, r * 2);
      } else if (preset.shape === "diamond") {
        ctx.moveTo(cx, cy - r * 1.15);
        ctx.lineTo(cx + r * 1.15, cy);
        ctx.lineTo(cx, cy + r * 1.15);
        ctx.lineTo(cx - r * 1.15, cy);
        ctx.closePath();
      } else {
        ctx.moveTo(cx, cy - r * 1.1);
        ctx.lineTo(cx + r * 1.1, cy + r * 0.9);
        ctx.lineTo(cx - r * 1.1, cy + r * 0.9);
        ctx.closePath();
      }
      ctx.fill();
      ctx.stroke();
      if (preset.shape === "double_circle") {
        ctx.beginPath();
        ctx.lineWidth = Math.max(1.2, 1.8 * scale);
        ctx.arc(cx, cy, r * 0.76, 0, Math.PI * 2);
        ctx.stroke();
      } else if (preset.shape === "double_square") {
        const ir = r * 0.74;
        ctx.lineWidth = Math.max(1.2, 1.8 * scale);
        ctx.strokeRect(cx - ir, cy - ir, ir * 2, ir * 2);
      } else if (preset.shape === "grate") {
        ctx.beginPath();
        ctx.lineWidth = Math.max(1, 1.4 * scale);
        for (const offset of [-0.45, 0.45]) {
          ctx.moveTo(cx - r * 0.75, cy + r * offset);
          ctx.lineTo(cx + r * 0.75, cy + r * offset);
        }
        ctx.stroke();
      }
      ctx.fillStyle = el.color;
      ctx.font = `700 ${Math.max(10, Math.round(11 * scale))}px sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(preset.code, cx, cy);
      if (el.label) {
        const fontSize = Math.max(11, Math.round(12 * scale));
        ctx.font = `600 ${fontSize}px sans-serif`;
        const tw = ctx.measureText(el.label).width;
        ctx.fillStyle = "rgba(255,255,255,0.9)";
        ctx.fillRect(cx - tw / 2 - 4, cy + r + 3, tw + 8, fontSize + 4);
        ctx.fillStyle = "#111827";
        ctx.fillText(el.label, cx, cy + r + 5 + fontSize / 2);
      }
    } else if (el.kind === "text") {
      const cx = el.x * w;
      const cy = el.y * h;
      const fontSize = Math.max(12, Math.round(15 * scale));
      ctx.font = `700 ${fontSize}px sans-serif`;
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      const tw = ctx.measureText(el.text).width;
      ctx.fillStyle = "rgba(255,255,255,0.88)";
      ctx.fillRect(cx - 4, cy - fontSize / 2 - 3, tw + 8, fontSize + 6);
      ctx.fillStyle = el.color;
      ctx.fillText(el.text, cx, cy);
    }
    ctx.restore();
  }
}