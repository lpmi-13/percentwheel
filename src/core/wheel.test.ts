import { describe as group, expect, it } from "vitest";
import {
  DragTracker,
  describe,
  formatPercent,
  normalize,
  numeratorForTurn,
  pointAtTurn,
  sectorPath,
  turnFromPoint,
} from "./wheel";

group("normalize", () => {
  it("keeps the numerator within the denominator", () => {
    expect(normalize({ numerator: 9, denominator: 4 })).toEqual({ numerator: 4, denominator: 4 });
    expect(normalize({ numerator: -2, denominator: 4 })).toEqual({ numerator: 0, denominator: 4 });
  });

  it("bounds the denominator to 1–100 whole numbers", () => {
    expect(normalize({ numerator: 0, denominator: 0 }).denominator).toBe(1);
    expect(normalize({ numerator: 0, denominator: 500 }).denominator).toBe(100);
    expect(normalize({ numerator: 1.4, denominator: 7.6 })).toEqual({ numerator: 1, denominator: 8 });
    expect(normalize({ numerator: NaN, denominator: NaN })).toEqual({ numerator: 0, denominator: 1 });
  });
});

group("formatPercent / describe", () => {
  it("is exact for whole and single-decimal percents", () => {
    expect(formatPercent({ numerator: 8, denominator: 25 })).toEqual({ text: "32%", exact: true });
    expect(formatPercent({ numerator: 3, denominator: 4 })).toEqual({ text: "75%", exact: true });
    expect(formatPercent({ numerator: 1, denominator: 8 })).toEqual({ text: "12.5%", exact: true });
    expect(formatPercent({ numerator: 0, denominator: 7 })).toEqual({ text: "0%", exact: true });
  });

  it("rounds everything else to one place", () => {
    expect(formatPercent({ numerator: 1, denominator: 3 })).toEqual({ text: "33.3%", exact: false });
    expect(formatPercent({ numerator: 2, denominator: 3 })).toEqual({ text: "66.7%", exact: false });
    expect(formatPercent({ numerator: 1, denominator: 7 })).toEqual({ text: "14.3%", exact: false });
  });

  it("reads naturally", () => {
    expect(describe({ numerator: 3, denominator: 4 })).toBe("3 out of 4, 75 percent");
    expect(describe({ numerator: 1, denominator: 3 })).toBe("1 out of 3, about 33.3 percent");
  });
});

group("turns", () => {
  it("measures clockwise from twelve o'clock", () => {
    expect(turnFromPoint(0, -1)).toBeCloseTo(0);
    expect(turnFromPoint(1, 0)).toBeCloseTo(0.25);
    expect(turnFromPoint(0, 1)).toBeCloseTo(0.5);
    expect(turnFromPoint(-1, 0)).toBeCloseTo(0.75);
    expect(turnFromPoint(-0.01, -1)).toBeGreaterThan(0.99);
  });

  it("round-trips with pointAtTurn", () => {
    for (const t of [0.1, 0.3, 0.55, 0.9]) {
      const p = pointAtTurn(t, 50);
      expect(turnFromPoint(p.x, p.y)).toBeCloseTo(t);
    }
  });

  it("snaps to the nearest slice", () => {
    expect(numeratorForTurn(0.74, 4)).toBe(3);
    expect(numeratorForTurn(0.99, 4)).toBe(4);
    expect(numeratorForTurn(0.01, 25)).toBe(0);
    expect(numeratorForTurn(0.32, 25)).toBe(8);
  });
});

group("sectorPath", () => {
  it("is empty at zero and a seamless disc when full", () => {
    expect(sectorPath(0, 100)).toBe("");
    expect(sectorPath(1, 100)).not.toContain("L");
  });

  it("uses the large arc only past halfway", () => {
    expect(sectorPath(0.25, 100)).toBe("M0 0L0 -100A100 100 0 0 1 100 0Z");
    expect(sectorPath(0.75, 100)).toBe("M0 0L0 -100A100 100 0 1 1 -100 0Z");
  });
});

group("DragTracker", () => {
  it("follows the pointer around the wheel", () => {
    const d = new DragTracker();
    expect(d.start(0.1)).toBe(0.1);
    expect(d.move(0.3)).toBe(0.3);
    expect(d.move(0.6)).toBe(0.6);
    expect(d.move(0.4)).toBe(0.4);
  });

  it("holds full when winding clockwise past the top, until it comes back", () => {
    const d = new DragTracker();
    d.start(0.9);
    expect(d.move(0.98)).toBe(0.98);
    expect(d.move(0.03)).toBe(1);
    expect(d.move(0.2)).toBe(1);
    expect(d.move(0.02)).toBe(1);
    expect(d.move(0.97)).toBe(0.97);
  });

  it("treats landing exactly on twelve o'clock as a crossing", () => {
    const d = new DragTracker();
    d.start(0.99);
    expect(d.move(0)).toBe(1);
    expect(d.move(0.01)).toBe(1);

    const e = new DragTracker();
    e.start(0);
    expect(e.move(0.99)).toBe(0);
  });

  it("holds empty when winding anticlockwise past the top", () => {
    const d = new DragTracker();
    d.start(0.1);
    expect(d.move(0.02)).toBe(0.02);
    expect(d.move(0.95)).toBe(0);
    expect(d.move(0.8)).toBe(0);
    expect(d.move(0.05)).toBe(0.05);
  });

  it("lets a sweep through the centre land where the pointer is", () => {
    const d = new DragTracker();
    d.start(0.2);
    expect(d.move(0.8)).toBe(0.8);
  });
});
