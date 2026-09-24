// The arithmetic behind the dashboards' charts (src/components/charts).
//
// Kept apart from the components so it can be unit-tested under plain Node
// (scripts/chart-math-test.mjs): a scale that rounds the wrong way draws a bar
// past the top of its chart, and a ring whose segments do not add up to the
// whole circle reads as a share of something that is not there.

/** The series colours, in order, as CSS variables defined in globals.css. */
export const SERIES_COLORS = ["var(--chart-1)", "var(--chart-2)", "var(--chart-3)", "var(--chart-4)", "var(--chart-5)", "var(--chart-6)"];

export function seriesColor(index: number): string {
  return SERIES_COLORS[((index % SERIES_COLORS.length) + SERIES_COLORS.length) % SERIES_COLORS.length];
}

export type Tone = "default" | "success" | "warning" | "danger" | "info" | "muted";

export function toneColor(tone: Tone | undefined): string {
  switch (tone) {
    case "success":
      return "var(--success)";
    case "warning":
      return "var(--warning)";
    case "danger":
      return "var(--danger)";
    case "info":
      return "var(--info)";
    case "muted":
      return "var(--border)";
    default:
      return "var(--primary)";
  }
}

/**
 * The top of a chart's scale: the smallest "round" number at or above the
 * largest value — 1, 2, 2.5, 5 or 10 times a power of ten — so the gridlines
 * land on numbers a person would say. Never below 1, so an all-zero chart
 * still has a scale rather than dividing by nothing.
 */
export function niceMax(value: number): number {
  if (!Number.isFinite(value) || value <= 1) return 1;
  const power = 10 ** Math.floor(Math.log10(value));
  for (const step of [1, 2, 2.5, 5, 10]) {
    if (step * power >= value) return step * power;
  }
  return 10 * power;
}

/** Evenly spaced gridline values from 0 to max inclusive. */
export function ticks(max: number, count = 4): number[] {
  const top = niceMax(max);
  return Array.from({ length: count + 1 }, (_, i) => (top * i) / count);
}

/** A value's share of the scale, 0-100, clamped: nothing is drawn past the top or below the axis. */
export function scalePercent(value: number, max: number): number {
  if (!Number.isFinite(value) || !Number.isFinite(max) || max <= 0) return 0;
  return Math.max(0, Math.min(100, (value / max) * 100));
}

/**
 * Part of a whole as a whole-number percentage, or null when there is no
 * whole — "0%" of nothing would read as a result.
 */
export function percentOf(part: number, whole: number): number | null {
  if (!Number.isFinite(part) || !Number.isFinite(whole) || whole <= 0) return null;
  return Math.round((part / whole) * 100);
}

export type Point = { x: number; y: number };

/**
 * Where each value sits on a line chart of the given size. The first and
 * last points touch the left and right edges; one lone value sits in the
 * middle rather than at the left edge on its own.
 */
export function linePoints(values: number[], width: number, height: number, max: number): Point[] {
  const top = max > 0 ? max : 1;
  if (values.length === 0) return [];
  if (values.length === 1) return [{ x: width / 2, y: height - (Math.max(0, values[0]) / top) * height }];
  const step = width / (values.length - 1);
  return values.map((v, i) => ({
    x: round(i * step),
    y: round(height - (Math.max(0, Math.min(v, top)) / top) * height),
  }));
}

export function linePath(points: Point[]): string {
  return points.map((p, i) => `${i === 0 ? "M" : "L"}${p.x} ${p.y}`).join(" ");
}

/** The line closed down to the baseline, for a filled area under it. */
export function areaPath(points: Point[], baseline: number): string {
  if (points.length === 0) return "";
  const first = points[0];
  const last = points[points.length - 1];
  return `${linePath(points)} L${last.x} ${baseline} L${first.x} ${baseline} Z`;
}

export type RingSegment = { length: number; offset: number };

/**
 * How to draw each share of a ring chart as a stroke along one circle:
 * the stroke's length and where along the circumference it starts. The
 * lengths add up to the whole circumference exactly when there is anything
 * to show; zero and negative values take no space.
 */
export function ringSegments(values: number[], circumference: number): RingSegment[] {
  const clean = values.map((v) => (Number.isFinite(v) && v > 0 ? v : 0));
  const total = clean.reduce((a, b) => a + b, 0);
  let at = 0;
  return clean.map((v) => {
    const length = total > 0 ? (v / total) * circumference : 0;
    const segment = { length, offset: at };
    at += length;
    return segment;
  });
}

/** 1,234 · 12.3k · 4.5M — for axis labels, where space is short. Money uses formatAmount. */
export function compactNumber(n: number): string {
  if (!Number.isFinite(n)) return "0";
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return `${trim(n / 1_000_000)}M`;
  if (abs >= 10_000) return `${trim(n / 1_000)}k`;
  return Math.round(n).toLocaleString("en-US");
}

function trim(n: number): string {
  return (Math.round(n * 10) / 10).toString();
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}
