// A registered student's countries, each with its own status bar, for their
// dashboard.
//
// The stages are the destination's dashboard pipeline (Admission Docs,
// Admission, Visa Status, Travel, ...) and the values are the ones staff set
// on the student's Dashboard tab (dashboardPipeline.ts, 0101). A student
// registered for a primary country and one or more backups gets one bar per
// country, marked as which — the backups run their own process in parallel,
// and folding them into one bar would hide that a backup is further ahead.
//
// Read more carefully than the staff card reads it, because a student cannot
// ask the screen what it meant. The staff card counts any value as the stage
// reached; here "In process", "Unpaid" or "Pending" is a stage under way, not
// a stage done, and "Rejected" stops the bar in red rather than filling it.
//
// Pure, so it is unit-tested (scripts/destination-status-test.mjs).

import type { DashboardStageDef } from "./dashboardPipeline.ts";
import { formatDateOnly } from "./formatDate.ts";

export type StageTone = "done" | "skipped" | "progress" | "blocked";

/** What a value set on a stage says about it. */
export function stageTone(value: string | null | undefined): StageTone | null {
  const v = (value ?? "").trim().toLowerCase();
  if (!v) return null;
  if (/reject|fail|refus|declin/.test(v)) return "blocked";
  if (/skip|not required/.test(v)) return "skipped";
  if (/unpaid|pending|waiting|in process|in progress|parked|applied/.test(v)) return "progress";
  return "done";
}

export type StageState = StageTone | "next" | "ahead";

export type DestinationStage = {
  key: string;
  label: string;
  /** As stored. */
  value: string | null;
  /** As shown: a date spelled out, anything else as written. */
  display: string | null;
  state: StageState;
};

export type DestinationRole = "primary" | "backup" | "applied";

export type DestinationStatusRow = {
  destinationId: string;
  name: string;
  code: string | null;
  role: DestinationRole;
  universities: string[];
  /** "No application yet", the one university, or "3 applications". */
  summary: string;
  stages: DestinationStage[];
  /** Done or skipped. */
  done: number;
  total: number;
  percent: number;
  /** The first stage not yet done — under way, stopped, or next up. Null once every stage is done. */
  current: DestinationStage | null;
};

export type RegisteredDestination = {
  destinationId: string;
  isBackup: boolean;
  createdAt?: string | null;
  values: Record<string, string> | null;
  name: string;
  code: string | null;
  stages: DashboardStageDef[];
};

export type AppliedDestination = {
  destinationId: string;
  name: string;
  code: string | null;
  stages: DashboardStageDef[];
  university: string;
};

const LONG_DATE: Intl.DateTimeFormatOptions = { day: "numeric", month: "short", year: "numeric" };

function displayValue(stage: DashboardStageDef, value: string | null): string | null {
  if (!value) return null;
  if (stage.type === "date" && /^\d{4}-\d{2}-\d{2}$/.test(value)) return formatDateOnly(value, LONG_DATE);
  return value;
}

/** One country's stages, each with where it stands. */
export function destinationStages(stages: readonly DashboardStageDef[], values: Record<string, string> | null): DestinationStage[] {
  const saved = values ?? {};
  let nextGiven = false;
  return stages.map((stage) => {
    const value = saved[stage.key]?.trim() ? saved[stage.key] : null;
    const tone = stageTone(value);
    let state: StageState;
    if (tone) state = tone;
    else if (!nextGiven) state = "next";
    else state = "ahead";
    // Only the first empty stage is "next"; one reached out of order does not
    // make a later empty stage the next thing to happen.
    if (state === "next") nextGiven = true;
    return { key: stage.key, label: stage.label, value, display: displayValue(stage, value), state };
  });
}

function summarise(universities: readonly string[]): string {
  if (universities.length === 0) return "No application yet";
  if (universities.length === 1) return universities[0];
  return `${universities.length} applications`;
}

/**
 * Every country the student is going through, in the order that matters to
 * them: the primary first, then each backup in the order it was added, then
 * any country they have an application to without having registered for it.
 */
export function destinationStatusRows(
  registered: readonly RegisteredDestination[],
  applied: readonly AppliedDestination[]
): DestinationStatusRow[] {
  const ordered = [...registered].sort(
    (a, b) => Number(a.isBackup) - Number(b.isBackup) || (a.createdAt ?? "").localeCompare(b.createdAt ?? "")
  );
  type Base = Pick<DestinationStatusRow, "destinationId" | "name" | "code" | "role" | "universities" | "stages">;
  const rows = new Map<string, Base>();
  for (const r of ordered) {
    if (rows.has(r.destinationId)) continue;
    rows.set(r.destinationId, {
      destinationId: r.destinationId,
      name: r.name,
      code: r.code,
      role: r.isBackup ? "backup" : "primary",
      universities: [],
      stages: destinationStages(r.stages, r.values),
    });
  }
  for (const a of applied) {
    const row = rows.get(a.destinationId);
    if (row) {
      row.universities.push(a.university);
      continue;
    }
    rows.set(a.destinationId, {
      destinationId: a.destinationId,
      name: a.name,
      code: a.code,
      role: "applied",
      universities: [a.university],
      stages: destinationStages(a.stages, null),
    });
  }
  return [...rows.values()].map((base) => {
    const done = base.stages.filter((s) => s.state === "done" || s.state === "skipped").length;
    const total = base.stages.length;
    return {
      ...base,
      summary: summarise(base.universities),
      done,
      total,
      percent: total === 0 ? 0 : Math.round((done / total) * 100),
      current: base.stages.find((s) => s.state !== "done" && s.state !== "skipped") ?? null,
    };
  });
}

/** What the header of a country's bar says about where it stands. */
export function destinationHeadline(row: Pick<DestinationStatusRow, "current" | "total">): string {
  if (row.total === 0) return "Your counsellor will show each step here as it happens";
  const c = row.current;
  if (!c) return "Every step is complete";
  if (c.state === "blocked") return `${c.label}: ${c.display}`;
  if (c.state === "progress") return `Now: ${c.label} — ${c.display}`;
  return `Next: ${c.label}`;
}
