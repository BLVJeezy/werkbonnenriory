import { describe, expect, it } from "vitest";
import { findNearestElementIndex, parseDrawingData } from "./ground-plan";

describe("ground-plan helpers", () => {
  it("parses valid drawing elements and drops malformed ones", () => {
    const parsed = parseDrawingData([
      { kind: "stroke", color: "#b91c1c", width: 4, points: [{ x: 0.1, y: 0.2 }, { x: 0.3, y: 0.4 }] },
      { kind: "line", color: "#1d4ed8", width: 5, x1: 0.1, y1: 0.1, x2: 0.5, y2: 0.5, arrow: true },
      { kind: "stamp", stamp: "toezichtsput", color: "#b91c1c", x: 0.5, y: 0.5, label: "65 cm" },
      { kind: "text", color: "#111827", x: 0.2, y: 0.8, text: "Ø 110 mm" },
      { kind: "stamp", stamp: "onbekend", color: "#000", x: 0.5, y: 0.5 },
      { kind: "text", color: "#000", x: 0.2, y: 0.2, text: "   " },
      null,
    ]);
    expect(parsed).toHaveLength(4);
    expect(parsed[1]).toMatchObject({ kind: "line", arrow: true });
    expect(parsed[2]).toMatchObject({ kind: "stamp", stamp: "toezichtsput", label: "65 cm" });
  });

  it("finds nearest element for eraser", () => {
    const elements = parseDrawingData([
      { kind: "stamp", stamp: "septische_put", color: "#b91c1c", x: 0.2, y: 0.2 },
      { kind: "line", color: "#1d4ed8", width: 4, x1: 0.5, y1: 0.5, x2: 0.8, y2: 0.5 },
    ]);
    expect(findNearestElementIndex(elements, 0.21, 0.19)).toBe(0);
    expect(findNearestElementIndex(elements, 0.65, 0.51)).toBe(1);
    expect(findNearestElementIndex(elements, 0.95, 0.95)).toBe(-1);
  });
});