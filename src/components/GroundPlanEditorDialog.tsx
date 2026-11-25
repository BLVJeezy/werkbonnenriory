import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { compressImage } from "@/lib/compress-image";
import {
  drawGridBackground,
  drawPlanElements,
  findNearestElementIndex,
  parseDrawingData,
  PIPE_COLORS,
  STAMP_PRESETS,
  type PlanElement,
  type StampType,
} from "@/lib/ground-plan";
import type { Json } from "@/integrations/supabase/types";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { ArrowUpRight, Eraser, Hand, Minus, Pencil, Redo2, Stamp, Trash2, Type, Undo2, Upload, ZoomIn, ZoomOut } from "lucide-react";

const BUCKET = "werkbon-fotos";

export type GroundPlanRecord = {
  id: string;
  customer_id: string;
  project_id: string | null;
  work_order_id: string | null;
  title: string;
  background_path: string | null;
  rendered_path: string;
  drawing_data: Json;
  include_in_pdf: boolean;
  created_at: string;
  url?: string | null;
  backgroundUrl?: string | null;
};

type Tool = "pan" | "pen" | "line" | "arrow" | "stamp" | "text" | "eraser";

type Props = {
  open: boolean;
  onClose: () => void;
  customerId: string;
  projectId?: string | null;
  workOrderId?: string | null;
  existingPlan?: GroundPlanRecord | null;
  reusablePlans?: GroundPlanRecord[];
  onSaved: () => void;
};

export function GroundPlanEditorDialog({
  open,
  onClose,
  customerId,
  projectId = null,
  workOrderId = null,
  existingPlan = null,
  reusablePlans = [],
  onSaved,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const bgImgRef = useRef<HTMLImageElement | null>(null);
  const panStartRef = useRef<{ x: number; y: number; left: number; top: number } | null>(null);

  const [title, setTitle] = useState("Rioolstelsel");
  const [includeInPdf, setIncludeInPdf] = useState(true);
  const [tool, setTool] = useState<Tool>("line");
  const [color, setColor] = useState<string>(PIPE_COLORS[0]!.hex);
  const [lineWidth, setLineWidth] = useState<number>(4);
  const [stamp, setStamp] = useState<StampType>("toezichtsput");
  const [elements, setElements] = useState<PlanElement[]>([]);
  const [redoStack, setRedoStack] = useState<PlanElement[][]>([]);
  const [draft, setDraft] = useState<PlanElement | null>(null);
  const [bgFile, setBgFile] = useState<File | null>(null);
  const [bgPath, setBgPath] = useState<string | null>(null);
  const [bgSrc, setBgSrc] = useState<string | null>(null);
  const [aspect, setAspect] = useState<number>(4 / 3);
  const [zoom, setZoom] = useState<number>(1);
  const [saving, setSaving] = useState(false);

  const drawingRef = useRef(false);

  useEffect(() => {
    if (!open) return;
    setTitle(existingPlan?.title ?? "Rioolstelsel");
    setIncludeInPdf(existingPlan?.include_in_pdf ?? true);
    setElements(parseDrawingData(existingPlan?.drawing_data));
    setRedoStack([]);
    setDraft(null);
    setBgFile(null);
    setBgPath(existingPlan?.background_path ?? null);
    setBgSrc(existingPlan?.backgroundUrl ?? null);
    setZoom(1);
  }, [open, existingPlan]);

  useEffect(() => {
    if (!bgSrc) {
      bgImgRef.current = null;
      setAspect(4 / 3);
      redraw();
      return;
    }
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      bgImgRef.current = img;
      if (img.naturalWidth > 0 && img.naturalHeight > 0) {
        setAspect(Math.max(0.25, Math.min(4, img.naturalWidth / img.naturalHeight)));
      }
      redraw();
    };
    img.onerror = () => {
      bgImgRef.current = null;
      redraw();
    };
    img.src = bgSrc;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bgSrc]);

  function redraw() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const w = canvas.width;
    const h = canvas.height;
    if (bgImgRef.current) {
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, w, h);
      ctx.drawImage(bgImgRef.current, 0, 0, w, h);
    } else {
      drawGridBackground(ctx, w, h);
    }
    drawPlanElements(ctx, w, h, draft ? [...elements, draft] : elements);
  }

  useEffect(() => {
    redraw();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [elements, draft, aspect, open]);

  function getNormPoint(e: React.PointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width)),
      y: Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height)),
    };
  }

  function pushElements(next: PlanElement[]) {
    setRedoStack([]);
    setElements(next);
  }

  function onPointerDown(e: React.PointerEvent<HTMLCanvasElement>) {
    e.currentTarget.setPointerCapture(e.pointerId);
    if (tool === "pan") {
      const box = scrollRef.current;
      if (box) {
        panStartRef.current = { x: e.clientX, y: e.clientY, left: box.scrollLeft, top: box.scrollTop };
      }
      return;
    }
    const pt = getNormPoint(e);
    if (tool === "eraser") {
      const idx = findNearestElementIndex(elements, pt.x, pt.y);
      if (idx >= 0) pushElements(elements.filter((_, i) => i !== idx));
      return;
    }
    if (tool === "stamp") {
      const label = window.prompt("Optioneel bijschrift (bv. diepte 65 cm):", "")?.trim();
      const el: PlanElement = { kind: "stamp", stamp, color, x: pt.x, y: pt.y };
      if (label) el.label = label;
      pushElements([...elements, el]);
      return;
    }
    if (tool === "text") {
      const text = window.prompt("Tekstlabel (bv. Ø 110 mm, diepte 65 cm):", "")?.trim();
      if (text) pushElements([...elements, { kind: "text", color, x: pt.x, y: pt.y, text }]);
      return;
    }
    drawingRef.current = true;
    if (tool === "pen") {
      setDraft({ kind: "stroke", color, width: lineWidth, points: [pt] });
    } else {
      setDraft({ kind: "line", color, width: lineWidth, x1: pt.x, y1: pt.y, x2: pt.x, y2: pt.y, arrow: tool === "arrow" });
    }
  }

  function onPointerMove(e: React.PointerEvent<HTMLCanvasElement>) {
    if (tool === "pan" && panStartRef.current && scrollRef.current) {
      scrollRef.current.scrollLeft = panStartRef.current.left - (e.clientX - panStartRef.current.x);
      scrollRef.current.scrollTop = panStartRef.current.top - (e.clientY - panStartRef.current.y);
      return;
    }
    if (!drawingRef.current || !draft) return;
    const pt = getNormPoint(e);
    if (draft.kind === "stroke") {
      setDraft({ ...draft, points: [...draft.points, pt] });
    } else if (draft.kind === "line") {
      setDraft({ ...draft, x2: pt.x, y2: pt.y });
    }
  }

  function onPointerUp() {
    if (panStartRef.current) {
      panStartRef.current = null;
      return;
    }
    if (!drawingRef.current) return;
    drawingRef.current = false;
    if (draft) {
      pushElements([...elements, draft]);
      setDraft(null);
    }
  }

  function undo() {
    if (elements.length === 0) return;
    setRedoStack((r) => [...r, elements]);
    setElements(elements.slice(0, -1));
  }

  function redo() {
    const prev = redoStack[redoStack.length - 1];
    if (!prev) return;
    setRedoStack(redoStack.slice(0, -1));
    setElements(prev);
  }

  async function handleUploadBackground(file: File | undefined) {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("Kies een afbeelding (JPG, PNG of foto van het grondplan).");
      return;
    }
    const compressed = await compressImage(file);
    setBgFile(compressed);
    setBgPath(null);
    setBgSrc(URL.createObjectURL(compressed));
  }

  function handleReusePlan(planId: string) {
    const chosen = reusablePlans.find((p) => p.id === planId);
    if (!chosen) return;
    setBgFile(null);
    setBgPath(chosen.background_path ?? chosen.rendered_path);
    setBgSrc(chosen.backgroundUrl ?? chosen.url ?? null);
    setElements(parseDrawingData(chosen.drawing_data));
    toast.success(`Grondplan "${chosen.title}" geladen als basis.`);
  }

  async function handleSave() {
    setSaving(true);
    try {
      const outW = 1400;
      const outH = Math.round(outW / aspect);
      const off = document.createElement("canvas");
      off.width = outW;
      off.height = outH;
      const ctx = off.getContext("2d");
      if (!ctx) throw new Error("Canvas niet beschikbaar");
      if (bgImgRef.current) {
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, outW, outH);
        ctx.drawImage(bgImgRef.current, 0, 0, outW, outH);
      } else {
        drawGridBackground(ctx, outW, outH);
      }
      drawPlanElements(ctx, outW, outH, elements);

      const blob = await new Promise<Blob | null>((res) => off.toBlob(res, "image/png"));
      if (!blob) throw new Error("Kon afbeelding niet bewaren");

      const folder = workOrderId ? workOrderId : `grondplannen/${customerId}`;
      let finalBgPath = bgPath;
      if (bgFile) {
        const ext = bgFile.name.split(".").pop()?.toLowerCase() || "jpg";
        finalBgPath = `${folder}/grondplan-bg-${crypto.randomUUID()}.${ext}`;
        const upBg = await supabase.storage.from(BUCKET).upload(finalBgPath, bgFile, { contentType: bgFile.type || "image/jpeg" });
        if (upBg.error) throw new Error(`Grondplan uploaden mislukt: ${upBg.error.message}`);
      }

      const renderedPath = `${folder}/grondplan-${crypto.randomUUID()}.png`;
      const upRender = await supabase.storage.from(BUCKET).upload(renderedPath, blob, { contentType: "image/png" });
      if (upRender.error) throw new Error(`Tekening opslaan mislukt: ${upRender.error.message}`);

      const { data: userData } = await supabase.auth.getUser();
      const payload = {
        customer_id: customerId,
        project_id: projectId,
        work_order_id: workOrderId,
        title: title.trim() || "Rioolstelsel",
        background_path: finalBgPath,
        rendered_path: renderedPath,
        drawing_data: elements as unknown as Json,
        include_in_pdf: includeInPdf,
        updated_at: new Date().toISOString(),
      };

      if (existingPlan) {
        const { error } = await supabase.from("customer_ground_plans").update(payload).eq("id", existingPlan.id);
        if (error) throw new Error(error.message);
        if (existingPlan.rendered_path && existingPlan.rendered_path !== renderedPath) {
          await supabase.storage.from(BUCKET).remove([existingPlan.rendered_path]);
        }
      } else {
        const { error } = await supabase.from("customer_ground_plans").insert({ ...payload, created_by: userData.user?.id ?? null });
        if (error) throw new Error(error.message);
      }

      toast.success("Rioolstelsel opgeslagen.");
      onSaved();
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Opslaan mislukt");
    } finally {
      setSaving(false);
    }
  }

  const canvasW = 1000;
  const canvasH = Math.round(canvasW / aspect);

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="flex h-[100dvh] max-h-[100dvh] w-full max-w-none flex-col gap-2 overflow-y-auto rounded-none p-3 sm:h-auto sm:max-h-[95dvh] sm:w-[calc(100vw-2rem)] sm:max-w-5xl sm:gap-3 sm:rounded-lg sm:p-6">
        <DialogHeader>
          <DialogTitle>Rioolstelsel / Grondplan intekenen</DialogTitle>
        </DialogHeader>

        <div className="flex flex-wrap items-center gap-2">
          <Input
            className="min-w-44 flex-1"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Titel (bv. Rioolstelsel gelijkvloers)"
          />
          {workOrderId && (
            <label className="flex cursor-pointer items-center gap-2 text-sm">
              <Checkbox checked={includeInPdf} onCheckedChange={(v) => setIncludeInPdf(v === true)} />
              Opnemen in werkbon-PDF
            </label>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2 rounded-md border bg-muted/40 p-2 text-xs">
          <Button asChild size="sm" variant="outline">
            <label className="cursor-pointer gap-1.5">
              <Upload className="h-3.5 w-3.5" />
              Grondplan / foto uploaden
              <input type="file" accept="image/*" className="hidden" onChange={(e) => { handleUploadBackground(e.target.files?.[0]); e.target.value = ""; }} />
            </label>
          </Button>
          <Button size="sm" variant="outline" onClick={() => { setBgFile(null); setBgPath(null); setBgSrc(null); }}>
            Blanco ruitjesraster
          </Button>
          {reusablePlans.length > 0 && (
            <select
              className="h-8 rounded-md border bg-background px-2 text-xs"
              defaultValue=""
              onChange={(e) => { if (e.target.value) { handleReusePlan(e.target.value); e.target.value = ""; } }}
            >
              <option value="">Bestaand plan hergebruiken…</option>
              {reusablePlans.map((p) => (
                <option key={p.id} value={p.id}>{p.title} ({new Date(p.created_at).toLocaleDateString("nl-BE")})</option>
              ))}
            </select>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          {([
            ["pan", "Slepen", Hand],
            ["line", "Leiding", Minus],
            ["arrow", "Stroomrichting", ArrowUpRight],
            ["pen", "Vrij tekenen", Pencil],
            ["stamp", "Stempel", Stamp],
            ["text", "Tekst", Type],
            ["eraser", "Gom", Eraser],
          ] as const).map(([id, label, Icon]) => (
            <Button key={id} size="sm" variant={tool === id ? "default" : "outline"} className="gap-1" onClick={() => setTool(id)}>
              <Icon className="h-3.5 w-3.5" />
              {label}
            </Button>
          ))}
          <div className="ml-auto flex items-center gap-1">
            <Button size="sm" variant="outline" onClick={() => setZoom((z) => Math.max(0.5, +(z - 0.25).toFixed(2)))} disabled={zoom <= 0.5} title="Uitzoomen"><ZoomOut className="h-3.5 w-3.5" /></Button>
            <Button size="sm" variant="outline" className="px-2 font-mono text-xs" onClick={() => setZoom(1)} title="Reset zoom">{Math.round(zoom * 100)}%</Button>
            <Button size="sm" variant="outline" onClick={() => setZoom((z) => Math.min(3, +(z + 0.25).toFixed(2)))} disabled={zoom >= 3} title="Inzoomen"><ZoomIn className="h-3.5 w-3.5" /></Button>
            <Button size="sm" variant="outline" onClick={undo} disabled={elements.length === 0} title="Ongedaan maken"><Undo2 className="h-3.5 w-3.5" /></Button>
            <Button size="sm" variant="outline" onClick={redo} disabled={redoStack.length === 0} title="Opnieuw"><Redo2 className="h-3.5 w-3.5" /></Button>
            <Button size="sm" variant="outline" onClick={() => { if (elements.length && confirm("Alle getekende lijnen wissen?")) pushElements([]); }} disabled={elements.length === 0} title="Alles wissen"><Trash2 className="h-3.5 w-3.5" /></Button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 text-xs">
          {PIPE_COLORS.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => setColor(c.hex)}
              className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 font-medium ${color === c.hex ? "border-foreground ring-2 ring-primary/40" : "border-border"}`}
            >
              <span className="h-3 w-3 rounded-full" style={{ backgroundColor: c.hex }} />
              {c.label}
            </button>
          ))}
          <div className="ml-auto flex items-center gap-1">
            {([2.5, 4, 7] as const).map((w) => (
              <Button key={w} size="sm" variant={lineWidth === w ? "default" : "outline"} className="h-7 px-2 text-xs" onClick={() => setLineWidth(w)}>
                {w === 2.5 ? "Dun" : w === 4 ? "Normaal" : "Dik"}
              </Button>
            ))}
          </div>
        </div>

        {tool === "stamp" && (
          <div className="flex flex-wrap gap-1.5 rounded-md border bg-muted/30 p-2 text-xs">
            {STAMP_PRESETS.map((s) => (
              <Button key={s.id} size="sm" variant={stamp === s.id ? "default" : "outline"} className="h-7 text-xs" onClick={() => setStamp(s.id)}>
                <span className="mr-1 font-mono font-bold">{s.code}</span>
                {s.label}
              </Button>
            ))}
          </div>
        )}

        <div
          ref={scrollRef}
          className="min-h-[45dvh] flex-1 overflow-auto rounded-md border bg-muted/20 p-2"
        >
          <div className="flex min-h-full min-w-full items-start justify-center">
            <canvas
              ref={canvasRef}
              width={canvasW}
              height={canvasH}
              style={{ width: `${Math.round(zoom * 100)}%`, height: "auto", maxWidth: "none" }}
              className={`block touch-none select-none ${tool === "pan" ? "cursor-grab active:cursor-grabbing" : "cursor-crosshair"}`}
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerCancel={onPointerUp}
            />
          </div>
        </div>

        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose} disabled={saving}>Annuleren</Button>
          <Button onClick={handleSave} disabled={saving}>{saving ? "Opslaan…" : "Grondplan opslaan"}</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}