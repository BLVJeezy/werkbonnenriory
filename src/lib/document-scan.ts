// @ts-nocheck -- dense pixel/matrix index math; covered by document-scan.test.ts
// Browser-side "Adobe Scan"-style processing: find the paper, straighten it,
// boost contrast in colour, and combine pages into one PDF.
import { PDFDocument } from 'pdf-lib';

export type Point = { x: number; y: number };

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

/** Turns a photo into a cropped, straightened, contrast-boosted JPEG blob. */
export async function processScan(file: Blob): Promise<Blob> {
  const bmp = await createImageBitmap(file);
  const srcCanvas = document.createElement('canvas');
  srcCanvas.width = bmp.width; srcCanvas.height = bmp.height;
  const sctx = srcCanvas.getContext('2d')!; sctx.drawImage(bmp, 0, 0);
  const src = sctx.getImageData(0, 0, bmp.width, bmp.height);

  // Detect on a small copy
  const scale = Math.min(1, 300 / Math.max(bmp.width, bmp.height));
  const sw = Math.max(1, Math.round(bmp.width * scale)), sh = Math.max(1, Math.round(bmp.height * scale));
  const small = document.createElement('canvas'); small.width = sw; small.height = sh;
  const smctx = small.getContext('2d')!; smctx.filter = 'blur(2px)'; smctx.drawImage(bmp, 0, 0, sw, sh);
  const sd = smctx.getImageData(0, 0, sw, sh).data;
  const gray = new Uint8Array(sw * sh);
  for (let i = 0; i < gray.length; i++) gray[i] = (sd[i * 4] * 0.299 + sd[i * 4 + 1] * 0.587 + sd[i * 4 + 2] * 0.114) | 0;
  const found = findDocumentCorners(gray, sw, sh);
  const corners = found ? found.map(p => ({ x: p.x / scale, y: p.y / scale }))
    : [{ x: 0, y: 0 }, { x: bmp.width, y: 0 }, { x: bmp.width, y: bmp.height }, { x: 0, y: bmp.height }];

  let W = Math.round(Math.max(dist(corners[0], corners[1]), dist(corners[3], corners[2])));
  let H = Math.round(Math.max(dist(corners[0], corners[3]), dist(corners[1], corners[2])));
  const limit = 2400 / Math.max(W, H); if (limit < 1) { W = Math.round(W * limit); H = Math.round(H * limit); }
  const m = homography(corners, W, H);
  const out = new ImageData(W, H); const o = out.data, s = src.data;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const p = project(m, x + 0.5, y + 0.5);
    const sx = Math.min(bmp.width - 1, Math.max(0, p.x | 0)), sy = Math.min(bmp.height - 1, Math.max(0, p.y | 0));
    const si = (sy * bmp.width + sx) * 4, di = (y * W + x) * 4;
    o[di] = s[si]; o[di + 1] = s[si + 1]; o[di + 2] = s[si + 2]; o[di + 3] = 255;
  }
  enhanceContrast(o);
  const outCanvas = document.createElement('canvas'); outCanvas.width = W; outCanvas.height = H;
  outCanvas.getContext('2d')!.putImageData(out, 0, 0);
  bmp.close();
  const blob = await new Promise<Blob | null>(r => outCanvas.toBlob(r, 'image/jpeg', 0.9));
  if (!blob) throw new Error('Scan verwerken mislukt.');
  return blob;
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
