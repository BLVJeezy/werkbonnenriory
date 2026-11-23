// @ts-nocheck -- dense pixel/matrix index math; covered by document-scan.test.ts
// Browser-side document scanner: 4-corner detection, bilinear perspective deskew,
// shadow-corrected Document / adaptive B&W / Original filters, and multi-page PDF export.
import { PDFDocument } from 'pdf-lib';

export type Point = { x: number; y: number };
export type Quad = [Point, Point, Point, Point];
export type ScanFilter = 'document' | 'bw' | 'original';
export type ScanAdjustments = {
  filter: ScanFilter;
  brightness: number; // -30..30
  contrast: number;   // -30..30
  rotation: 0 | 90 | 180 | 270;
};

export const DEFAULT_SCAN_ADJUSTMENTS: ScanAdjustments = {
  filter: 'document',
  brightness: 0,
  contrast: 0,
  rotation: 0,
};

export function fullFrameQuad(w: number, h: number): Quad {
  return [{ x: 0, y: 0 }, { x: w, y: 0 }, { x: w, y: h }, { x: 0, y: h }];
}

/** Orders 4 arbitrary points into [topLeft, topRight, bottomRight, bottomLeft]. */
export function orderCorners(pts: Point[]): Quad {
  const sorted = [...pts].slice(0, 4);
  const bySum = [...sorted].sort((a, b) => (a.x + a.y) - (b.x + b.y));
  const byDiff = [...sorted].sort((a, b) => (a.x - a.y) - (b.x - b.y));
  return [bySum[0], byDiff[3], bySum[3], byDiff[0]];
}

/** Returns true if the 4-point quad is strictly convex and non-degenerate. */
export function isConvexQuad(q: Point[]): boolean {
  if (q.length !== 4) return false;
  let sign = 0;
  for (let i = 0; i < 4; i++) {
    const a = q[i], b = q[(i + 1) % 4], c = q[(i + 2) % 4];
    const cross = (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x);
    if (Math.abs(cross) < 1e-3) return false;
    const s = cross > 0 ? 1 : -1;
    if (sign === 0) sign = s;
    else if (sign !== s) return false;
  }
  return true;
}

/** Finds the four corners of the largest bright area (the paper) in a grayscale image. */
export function findDocumentCorners(gray: Uint8Array, w: number, h: number): Point[] | null {
  // Otsu threshold
  const hist = new Array(256).fill(0);
  for (const v of gray) hist[v]++;
  const total = gray.length; let sum = 0;
  for (let i = 0; i < 256; i++) sum += i * hist[i];
  let sumB = 0, wB = 0, best = 0, thr = 128;
  for (let t = 0; t < 256; t++) {
    wB += hist[t]; if (!wB) continue;
    const wF = total - wB; if (!wF) break;
    sumB += t * hist[t];
    const mB = sumB / wB, mF = (sum - sumB) / wF;
    const between = wB * wF * (mB - mF) ** 2;
    if (between > best) { best = between; thr = t; }
  }
  // Largest connected bright component
  const label = new Int32Array(total).fill(-1);
  let bestId = -1, bestSize = 0; const stack: number[] = [];
  for (let i = 0; i < total; i++) {
    if (label[i] !== -1 || gray[i] <= thr) continue;
    let size = 0; stack.push(i); label[i] = i;
    while (stack.length) {
      const p = stack.pop()!; size++;
      const x = p % w, y = (p - x) / w;
      const n = [x > 0 ? p - 1 : -1, x < w - 1 ? p + 1 : -1, y > 0 ? p - w : -1, y < h - 1 ? p + w : -1];
      for (const q of n) if (q >= 0 && label[q] === -1 && gray[q] > thr) { label[q] = i; stack.push(q); }
    }
    if (size > bestSize) { bestSize = size; bestId = i; }
  }
  if (bestId < 0 || bestSize < total * 0.15 || bestSize > total * 0.97) return null;
  let tl = { s: Infinity, p: { x: 0, y: 0 } }, br = { s: -Infinity, p: { x: 0, y: 0 } };
  let tr = { s: -Infinity, p: { x: 0, y: 0 } }, bl = { s: Infinity, p: { x: 0, y: 0 } };
  for (let i = 0; i < total; i++) {
    if (label[i] !== bestId) continue;
    const x = i % w, y = (i - x) / w;
    if (x + y < tl.s) tl = { s: x + y, p: { x, y } };
    if (x + y > br.s) br = { s: x + y, p: { x, y } };
    if (x - y > tr.s) tr = { s: x - y, p: { x, y } };
    if (x - y < bl.s) bl = { s: x - y, p: { x, y } };
  }
  return [tl.p, tr.p, br.p, bl.p];
}

/** Homography mapping unit-rectangle (0..W,0..H) points to the source quad. */
export function homography(dst: Point[], W: number, H: number): number[] {
  const src = [{ x: 0, y: 0 }, { x: W, y: 0 }, { x: W, y: H }, { x: 0, y: H }];
  const A: number[][] = [];
  for (let i = 0; i < 4; i++) {
    const { x, y } = src[i], { x: u, y: v } = dst[i];
    A.push([x, y, 1, 0, 0, 0, -u * x, -u * y, u]);
    A.push([0, 0, 0, x, y, 1, -v * x, -v * y, v]);
  }
  for (let c = 0; c < 8; c++) {
    let piv = c; for (let r = c + 1; r < 8; r++) if (Math.abs(A[r][c]) > Math.abs(A[piv][c])) piv = r;
    [A[c], A[piv]] = [A[piv], A[c]];
    for (let r = 0; r < 8; r++) if (r !== c) {
      const f = A[r][c] / A[c][c];
      for (let k = c; k < 9; k++) A[r][k] -= f * A[c][k];
    }
  }
  return [...A.map((row, i) => row[8] / row[i]), 1];
}

export function project(m: number[], x: number, y: number): Point {
  const d = m[6] * x + m[7] * y + m[8];
  return { x: (m[0] * x + m[1] * y + m[2]) / d, y: (m[3] * x + m[4] * y + m[5]) / d };
}

const dist = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);
const clamp255 = (v: number) => (v < 0 ? 0 : v > 255 ? 255 : v);

/** Bilinear perspective warp from source ImageData onto a straightened rectangle. */
export function warpPerspectiveData(src: ImageData, corners: Point[], maxDim = 2200): ImageData {
  let W = Math.max(16, Math.round(Math.max(dist(corners[0], corners[1]), dist(corners[3], corners[2]))));
  let H = Math.max(16, Math.round(Math.max(dist(corners[0], corners[3]), dist(corners[1], corners[2]))));
  const limit = maxDim / Math.max(W, H);
  if (limit < 1) { W = Math.max(16, Math.round(W * limit)); H = Math.max(16, Math.round(H * limit)); }
  const m = homography(corners, W, H);
  const out = new Uint8ClampedArray(W * H * 4);
  const s = src.data, sw = src.width, sh = src.height;
  const maxX = sw - 1, maxY = sh - 1;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const p = project(m, x + 0.5, y + 0.5);
      const fx = Math.min(maxX, Math.max(0, p.x));
      const fy = Math.min(maxY, Math.max(0, p.y));
      const x0 = fx | 0, y0 = fy | 0;
      const x1 = x0 < maxX ? x0 + 1 : maxX;
      const y1 = y0 < maxY ? y0 + 1 : maxY;
      const dx = fx - x0, dy = fy - y0;
      const w00 = (1 - dx) * (1 - dy), w10 = dx * (1 - dy), w01 = (1 - dx) * dy, w11 = dx * dy;
      const i00 = (y0 * sw + x0) * 4, i10 = (y0 * sw + x1) * 4;
      const i01 = (y1 * sw + x0) * 4, i11 = (y1 * sw + x1) * 4;
      const di = (y * W + x) * 4;
      out[di]     = s[i00]     * w00 + s[i10]     * w10 + s[i01]     * w01 + s[i11]     * w11;
      out[di + 1] = s[i00 + 1] * w00 + s[i10 + 1] * w10 + s[i01 + 1] * w01 + s[i11 + 1] * w11;
      out[di + 2] = s[i00 + 2] * w00 + s[i10 + 2] * w10 + s[i01 + 2] * w01 + s[i11 + 2] * w11;
      out[di + 3] = 255;
    }
  }
  return new ImageData(out, W, H);
}

/** O(N) integral-image local mean luminance for shadow removal and adaptive thresholding. */
function buildIntegralLuma(d: Uint8ClampedArray, w: number, h: number): Float64Array {
  const stride = w + 1;
  const sat = new Float64Array((w + 1) * (h + 1));
  for (let y = 0; y < h; y++) {
    let rowSum = 0;
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      rowSum += d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114;
      sat[(y + 1) * stride + (x + 1)] = sat[y * stride + (x + 1)] + rowSum;
    }
  }
  return sat;
}

function boxMean(sat: Float64Array, w: number, h: number, x: number, y: number, r: number): number {
  const stride = w + 1;
  const x0 = Math.max(0, x - r), y0 = Math.max(0, y - r);
  const x1 = Math.min(w - 1, x + r), y1 = Math.min(h - 1, y + r);
  const sum = sat[(y1 + 1) * stride + (x1 + 1)] - sat[y0 * stride + (x1 + 1)] - sat[(y1 + 1) * stride + x0] + sat[y0 * stride + x0];
  return sum / ((x1 - x0 + 1) * (y1 - y0 + 1));
}

/** Applies 'document' (shadow-removed white paper), 'bw' (adaptive threshold), or 'original' filter + brightness/contrast. */
export function applyScanFilter(d: Uint8ClampedArray, w: number, h: number, opts: Pick<ScanAdjustments, 'filter' | 'brightness' | 'contrast'>): void {
  const { filter, brightness, contrast } = opts;
  if (filter === 'document') {
    const sat = buildIntegralLuma(d, w, h);
    const radius = Math.max(14, Math.round(Math.min(w, h) * 0.045));
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4;
        const bg = Math.max(45, boxMean(sat, w, h, x, y, radius));
        const gain = 248 / bg;
        for (let c = 0; c < 3; c++) {
          // Normalize against local paper illumination, then gently deepen dark ink
          let v = d[i + c] * gain;
          if (v > 228) v = 255;
          else if (v < 190) v = v * 0.88;
          d[i + c] = clamp255(v);
        }
      }
    }
  } else if (filter === 'bw') {
    const sat = buildIntegralLuma(d, w, h);
    const radius = Math.max(10, Math.round(Math.min(w, h) * 0.025));
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4;
        const luma = d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114;
        const mean = boxMean(sat, w, h, x, y, radius);
        // Soft adaptive ramp preserves faint thermal-receipt strokes without harsh speckles
        const diff = mean - luma;
        const out = diff <= 7 ? 255 : diff >= 24 ? 18 : clamp255(255 - ((diff - 7) / 17) * 237);
        d[i] = out; d[i + 1] = out; d[i + 2] = out;
      }
    }
  }

  if (brightness !== 0 || contrast !== 0) {
    const bOffset = brightness * 1.8;
    const cFactor = (100 + contrast * 1.5) / 100;
    for (let i = 0; i < d.length; i += 4) {
      for (let c = 0; c < 3; c++) {
        d[i + c] = clamp255((d[i + c] - 128) * cFactor + 128 + bOffset);
      }
    }
  }
}

export interface LoadedScanSource {
  canvas: HTMLCanvasElement;
  width: number;
  height: number;
  autoCorners: Quad;
}

/** Decodes a camera/upload image with EXIF orientation, caps size for mobile memory safety, and detects 4 document corners. */
export async function loadScanSource(file: Blob, maxWorkingDim = 2200): Promise<LoadedScanSource> {
  let bmp: ImageBitmap;
  try {
    bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    bmp = await createImageBitmap(file);
  }
  const scaleDown = Math.min(1, maxWorkingDim / Math.max(bmp.width, bmp.height));
  const width = Math.max(1, Math.round(bmp.width * scaleDown));
  const height = Math.max(1, Math.round(bmp.height * scaleDown));
  const canvas = document.createElement('canvas');
  canvas.width = width; canvas.height = height;
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(bmp, 0, 0, width, height);
  bmp.close();

  const detScale = Math.min(1, 320 / Math.max(width, height));
  const sw = Math.max(1, Math.round(width * detScale));
  const sh = Math.max(1, Math.round(height * detScale));
  const small = document.createElement('canvas'); small.width = sw; small.height = sh;
  const smctx = small.getContext('2d')!; smctx.filter = 'blur(2px)'; smctx.drawImage(canvas, 0, 0, sw, sh);
  const sd = smctx.getImageData(0, 0, sw, sh).data;
  const gray = new Uint8Array(sw * sh);
  for (let i = 0; i < gray.length; i++) gray[i] = (sd[i * 4] * 0.299 + sd[i * 4 + 1] * 0.587 + sd[i * 4 + 2] * 0.114) | 0;
  const found = findDocumentCorners(gray, sw, sh);
  const autoCorners: Quad = found
    ? orderCorners(found.map(p => ({ x: Math.min(width, Math.max(0, p.x / detScale)), y: Math.min(height, Math.max(0, p.y / detScale)) })))
    : fullFrameQuad(width, height);

  return { canvas, width, height, autoCorners };
}

/** Renders a straightened, filtered, rotated JPEG blob from a loaded scan source and 4 corners. */
export async function renderScannedPage(source: LoadedScanSource, corners: Quad, adjustments: ScanAdjustments = DEFAULT_SCAN_ADJUSTMENTS): Promise<Blob> {
  const sctx = source.canvas.getContext('2d')!;
  const srcData = sctx.getImageData(0, 0, source.width, source.height);
  const warped = warpPerspectiveData(srcData, corners, 2200);
  applyScanFilter(warped.data, warped.width, warped.height, adjustments);

  const warpCanvas = document.createElement('canvas');
  warpCanvas.width = warped.width; warpCanvas.height = warped.height;
  warpCanvas.getContext('2d')!.putImageData(warped, 0, 0);

  let outCanvas = warpCanvas;
  if (adjustments.rotation !== 0) {
    const rot = document.createElement('canvas');
    const swap = adjustments.rotation === 90 || adjustments.rotation === 270;
    rot.width = swap ? warpCanvas.height : warpCanvas.width;
    rot.height = swap ? warpCanvas.width : warpCanvas.height;
    const rctx = rot.getContext('2d')!;
    rctx.translate(rot.width / 2, rot.height / 2);
    rctx.rotate((adjustments.rotation * Math.PI) / 180);
    rctx.drawImage(warpCanvas, -warpCanvas.width / 2, -warpCanvas.height / 2);
    outCanvas = rot;
  }

  const blob = await new Promise<Blob | null>(r => outCanvas.toBlob(r, 'image/jpeg', 0.92));
  if (!blob) throw new Error('Scan verwerken mislukt.');
  return blob;
}

/** Turns a photo into a cropped, straightened, contrast-boosted JPEG blob. */
export async function processScan(file: Blob): Promise<Blob> {
  const source = await loadScanSource(file);
  return renderScannedPage(source, source.autoCorners, DEFAULT_SCAN_ADJUSTMENTS);
}

/** Colour-preserving levels stretch: paper becomes white, ink darker. */
export function enhanceContrast(d: Uint8ClampedArray) {
  const hist = new Array(256).fill(0); const n = d.length / 4;
  for (let i = 0; i < d.length; i += 4) hist[(d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114) | 0]++;
  let lo = 0, hi = 255, acc = 0;
  for (; lo < 255; lo++) { acc += hist[lo]; if (acc > n * 0.02) break; }
  acc = 0;
  for (; hi > 0; hi--) { acc += hist[hi]; if (acc > n * 0.15) break; } // paper dominates the bright end
  if (hi - lo < 30) return;
  const f = 255 / (hi - lo);
  for (let i = 0; i < d.length; i += 4) for (let c = 0; c < 3; c++) d[i + c] = (d[i + c] - lo) * f;
}

/** Combines processed JPEG pages into one A4-width PDF. */
export async function pagesToPdf(pages: Blob[]): Promise<File> {
  const pdf = await PDFDocument.create();
  for (const page of pages) {
    const img = await pdf.embedJpg(new Uint8Array(await page.arrayBuffer()));
    const w = 595, h = (img.height / img.width) * w;
    pdf.addPage([w, h]).drawImage(img, { x: 0, y: 0, width: w, height: h });
  }
  return new File([new Uint8Array(await pdf.save()) as BlobPart], 'scan.pdf', { type: 'application/pdf' });
}
