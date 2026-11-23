import { describe, expect, it } from 'vitest';
import { applyScanFilter, findDocumentCorners, homography, isConvexQuad, orderCorners, project } from './document-scan';

describe('document scan', () => {
  it('finds the corners of a bright paper on a dark background', () => {
    const w = 100, h = 100, g = new Uint8Array(w * h).fill(30);
    for (let y = 20; y < 80; y++) for (let x = 30; x < 70; x++) g[y * w + x] = 230;
    expect(findDocumentCorners(g, w, h)).toEqual([{ x: 30, y: 20 }, { x: 69, y: 20 }, { x: 69, y: 79 }, { x: 30, y: 79 }]);
  });
  it('returns null when no paper stands out', () => {
    expect(findDocumentCorners(new Uint8Array(100).fill(200), 10, 10)).toBeNull();
  });
  it('maps the output rectangle onto a tilted quad', () => {
    const quad = [{ x: 10, y: 5 }, { x: 90, y: 15 }, { x: 85, y: 95 }, { x: 5, y: 90 }];
    const m = homography(quad, 200, 300);
    const c = project(m, 200, 300);
    expect(c.x).toBeCloseTo(85); expect(c.y).toBeCloseTo(95);
  });
  it('orders shuffled corners into TL, TR, BR, BL and validates convexity', () => {
    const shuffled = [{ x: 90, y: 95 }, { x: 10, y: 5 }, { x: 5, y: 90 }, { x: 88, y: 12 }];
    const ordered = orderCorners(shuffled);
    expect(ordered).toEqual([{ x: 10, y: 5 }, { x: 88, y: 12 }, { x: 90, y: 95 }, { x: 5, y: 90 }]);
    expect(isConvexQuad(ordered)).toBe(true);
    // Crossed bowtie quad must be rejected
    expect(isConvexQuad([{ x: 10, y: 10 }, { x: 90, y: 90 }, { x: 90, y: 10 }, { x: 10, y: 90 }])).toBe(false);
  });
  it('normalizes shadowed paper to bright white while keeping dark ink readable in Document mode', () => {
    const w = 40, h = 40;
    const data = new Uint8ClampedArray(w * h * 4);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4;
        // Shadowed gray paper (150) with dark text pixel in the center (40)
        const v = (x === 20 && y === 20) ? 40 : 150;
        data[i] = v; data[i + 1] = v; data[i + 2] = v; data[i + 3] = 255;
      }
    }
    applyScanFilter(data, w, h, { filter: 'document', brightness: 0, contrast: 0 });
    const paperIdx = (5 * w + 5) * 4;
    const inkIdx = (20 * w + 20) * 4;
    expect(data[paperIdx]).toBeGreaterThanOrEqual(245);
    expect(data[inkIdx]).toBeLessThan(80);
  });
  it('keeps dark text crisp and paper white in adaptive B&W mode', () => {
    const w = 40, h = 40;
    const data = new Uint8ClampedArray(w * h * 4);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4;
        const v = (x === 20 && y === 20) ? 90 : 170;
        data[i] = v; data[i + 1] = v; data[i + 2] = v; data[i + 3] = 255;
      }
    }
    applyScanFilter(data, w, h, { filter: 'bw', brightness: 0, contrast: 0 });
    expect(data[(5 * w + 5) * 4]).toBe(255);
    expect(data[(20 * w + 20) * 4]).toBeLessThan(50);
  });
});
