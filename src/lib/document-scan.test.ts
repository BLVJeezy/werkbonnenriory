import { describe, expect, it } from 'vitest';
import { findDocumentCorners, homography, project } from './document-scan';

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
});
