import { test } from "node:test";
import assert from "node:assert/strict";
import {
  areaPath,
  compactNumber,
  linePath,
  linePoints,
  niceMax,
  percentOf,
  ringSegments,
  scalePercent,
  seriesColor,
  ticks,
} from "../src/lib/chartMath.ts";

test("a scale tops out at a round number at or above the largest value", () => {
  assert.equal(niceMax(0), 1);
  assert.equal(niceMax(1), 1);
  assert.equal(niceMax(3), 5);
  assert.equal(niceMax(7), 10);
  assert.equal(niceMax(12), 20);
  assert.equal(niceMax(21), 25);
  assert.equal(niceMax(20), 20, "exactly round stays put");
  assert.equal(niceMax(480), 500);
  assert.equal(niceMax(1234567), 2000000);
  assert.equal(niceMax(NaN), 1);
  assert.equal(niceMax(-5), 1);
});

test("gridlines run evenly from zero to the top of the scale", () => {
  assert.deepEqual(ticks(7), [0, 2.5, 5, 7.5, 10]);
  assert.deepEqual(ticks(0), [0, 0.25, 0.5, 0.75, 1]);
});

test("nothing is drawn past the top or below the axis", () => {
  assert.equal(scalePercent(5, 10), 50);
  assert.equal(scalePercent(15, 10), 100);
  assert.equal(scalePercent(-3, 10), 0);
  assert.equal(scalePercent(5, 0), 0);
});

test("a share of nothing is no share, not 0%", () => {
  assert.equal(percentOf(3, 4), 75);
  assert.equal(percentOf(0, 4), 0);
  assert.equal(percentOf(3, 0), null);
  assert.equal(percentOf(2, 3), 67);
});

test("a line spans the full width, and one value sits in the middle", () => {
  const pts = linePoints([0, 5, 10], 100, 50, 10);
  assert.deepEqual(pts, [
    { x: 0, y: 50 },
    { x: 50, y: 25 },
    { x: 100, y: 0 },
  ]);
  assert.deepEqual(linePoints([4], 100, 50, 10), [{ x: 50, y: 30 }]);
  assert.deepEqual(linePoints([], 100, 50, 10), []);
  assert.equal(linePath(pts), "M0 50 L50 25 L100 0");
  assert.equal(areaPath(pts, 50), "M0 50 L50 25 L100 0 L100 50 L0 50 Z");
});

test("a value above the scale is held at the top edge", () => {
  assert.equal(linePoints([0, 20], 100, 50, 10)[1].y, 0);
});

test("ring segments cover the whole circle, and empty or negative shares take none", () => {
  const segs = ringSegments([1, 0, 3, -2], 100);
  assert.deepEqual(
    segs.map((s) => s.length),
    [25, 0, 75, 0]
  );
  assert.deepEqual(
    segs.map((s) => s.offset),
    [0, 25, 25, 100]
  );
  assert.equal(
    segs.reduce((a, s) => a + s.length, 0),
    100
  );
  assert.deepEqual(
    ringSegments([0, 0], 100).map((s) => s.length),
    [0, 0]
  );
});

test("axis numbers are short", () => {
  assert.equal(compactNumber(950), "950");
  assert.equal(compactNumber(4200), "4,200");
  assert.equal(compactNumber(12500), "12.5k");
  assert.equal(compactNumber(3450000), "3.5M");
});

test("series colours cycle rather than running out", () => {
  assert.equal(seriesColor(0), "var(--chart-1)");
  assert.equal(seriesColor(6), "var(--chart-1)");
  assert.equal(seriesColor(-1), "var(--chart-6)");
});
