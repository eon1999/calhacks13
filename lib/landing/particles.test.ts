import { describe, expect, it } from "vitest";
import {
  SHAPES,
  makeShape,
  project,
  repel,
  springStep,
} from "./particles";

describe("makeShape", () => {
  it.each(SHAPES)("%s yields the requested number of bounded xyz points", (shape) => {
    const pts = makeShape(shape, 500);
    expect(pts).toHaveLength(500 * 3);
    for (const v of pts) {
      expect(Number.isFinite(v)).toBe(true);
      expect(Math.abs(v)).toBeLessThanOrEqual(1.6);
    }
  });

  it("is deterministic for the same shape and count", () => {
    expect(makeShape("ecg", 50)).toEqual(makeShape("ecg", 50));
  });

  it("ecg reads as a heartbeat trace: flat baseline with tall spikes", () => {
    const pts = makeShape("ecg", 2000);
    const ys: number[] = [];
    for (let i = 1; i < pts.length; i += 3) ys.push(pts[i]);
    const sorted = [...ys].map(Math.abs).sort((a, b) => a - b);
    expect(sorted[Math.floor(sorted.length / 2)]).toBeLessThan(0.12); // mostly baseline
    expect(Math.min(...ys)).toBeLessThan(-0.8); // R peaks point up (screen y is down)
  });
});

describe("project", () => {
  it("maps the origin to the stage centre at base scale", () => {
    const p = project(0, 0, 0, { cx: 100, cy: 50, scale: 200, fov: 4 });
    expect(p).toEqual({ x: 100, y: 50, k: 1 });
  });

  it("shrinks points further from the viewer", () => {
    const near = project(1, 0, -1, { cx: 0, cy: 0, scale: 100, fov: 4 });
    const far = project(1, 0, 1, { cx: 0, cy: 0, scale: 100, fov: 4 });
    expect(near.k).toBeGreaterThan(far.k);
    expect(Math.abs(near.x)).toBeGreaterThan(Math.abs(far.x));
  });
});

describe("repel", () => {
  it("is zero outside the radius", () => {
    expect(repel(200, 0, 100, 1)).toEqual({ fx: 0, fy: 0 });
  });

  it("pushes away from the pointer, stronger when closer", () => {
    const close = repel(10, 0, 100, 1);
    const far = repel(80, 0, 100, 1);
    expect(close.fx).toBeGreaterThan(far.fx);
    expect(far.fx).toBeGreaterThan(0);
    expect(repel(0, -10, 100, 1).fy).toBeLessThan(0);
  });
});

describe("springStep", () => {
  it("settles a displaced particle back to rest", () => {
    let s = { offset: 50, velocity: 0 };
    for (let i = 0; i < 400; i++) s = springStep(s.offset, s.velocity, 0, 0.06, 0.86);
    expect(Math.abs(s.offset)).toBeLessThan(0.01);
  });
});
