// Where a registered student has got to in each country they are going to:
// the country stages ("Admission Docs → Admission → … → Enrollment") set per
// destination in Setup (destinations.dashboard_pipeline_stages, 0101) and
// ticked off per student (lead_destinations.dashboard_stage_values).
//
// One place for it, because three things show it and must agree: the
// student's own record, the reduced view a counsellor gets of a registered
// student, and the dashboards that count students by stage.
//
// Pure, so it is unit-tested (scripts/stage-progress-test.mjs).

import { currentStageIndex, isNegativeValue, type DashboardStageDef, type DashboardStageValues } from "./dashboardPipeline.ts";

export type StageApplication = {
  destinationId: string;
  destinationName: string;
  stages: DashboardStageDef[];
  universityName: string;
};

export type StageDestination = {
  destinationId: string;
  destinationName: string;
  stages: DashboardStageDef[];
  values: DashboardStageValues;
};

export type StageRow = {
  destinationId: string;
  destinationName: string;
  /** "Università di Bologna", "3 applications", or "No application yet". */
  applicationSummary: string;
  stages: DashboardStageDef[];
  values: DashboardStageValues;
};

/**
 * One row per country the student is being processed for: every country an
 * application is in (in application order), then any country they registered
 * for that has no application yet. A country with no stages set up in Setup
 * has nothing to show and is left out.
 */
export function buildStageRows(applications: StageApplication[], registered: StageDestination[]): StageRow[] {
  const groups = new Map<string, { destinationName: string; stages: DashboardStageDef[]; universityNames: string[] }>();
  for (const a of applications) {
    if (!a.destinationId) continue;
    if (!groups.has(a.destinationId)) {
      groups.set(a.destinationId, { destinationName: a.destinationName || "Destination", stages: a.stages ?? [], universityNames: [] });
    }
    groups.get(a.destinationId)!.universityNames.push(a.universityName || "University");
  }
  for (const d of registered) {
    if (!d.destinationId || groups.has(d.destinationId)) continue;
    groups.set(d.destinationId, { destinationName: d.destinationName || "Destination", stages: d.stages ?? [], universityNames: [] });
  }
  const valuesFor = new Map(registered.map((d) => [d.destinationId, d.values ?? {}]));

  return [...groups.entries()]
    .filter(([, g]) => g.stages.length > 0)
    .map(([destinationId, g]) => ({
      destinationId,
      destinationName: g.destinationName,
      applicationSummary:
        g.universityNames.length === 0
          ? "No application yet"
          : g.universityNames.length === 1
            ? g.universityNames[0]
            : `${g.universityNames.length} applications`,
      stages: g.stages,
      values: valuesFor.get(destinationId) ?? {},
    }));
}

export type StageSnapshot = {
  /** Stages with a value recorded. */
  done: number;
  total: number;
  /** The first stage with nothing recorded — what is being worked on now. */
  currentLabel: string;
  /** Every stage has a value. */
  complete: boolean;
  /** The latest recorded value is a refusal, a failure or a wait (isNegativeValue). */
  blocked: boolean;
  /** The latest recorded stage and its value, e.g. "Visa Status: Granted". */
  latest: string | null;
};

export function stageSnapshot(stages: DashboardStageDef[], values: DashboardStageValues): StageSnapshot {
  const total = stages.length;
  const done = stages.filter((s) => Boolean(values[s.key])).length;
  const complete = total > 0 && done === total;
  const idx = total ? currentStageIndex(stages, values) : -1;
  let latestIdx = -1;
  for (let i = stages.length - 1; i >= 0; i--) {
    if (values[stages[i].key]) {
      latestIdx = i;
      break;
    }
  }
  const latestStage = latestIdx >= 0 ? stages[latestIdx] : null;
  const latestValue = latestStage ? values[latestStage.key] : undefined;
  return {
    done,
    total,
    currentLabel: complete ? "Complete" : (stages[idx]?.label ?? "Not started"),
    complete,
    blocked: isNegativeValue(latestValue),
    latest: latestStage ? `${latestStage.label}: ${latestValue}` : null,
  };
}

/**
 * How many students are at each stage of one destination's list, in the
 * list's own order — the bar chart on a processing dashboard. A student who
 * has finished every stage counts under "Complete", after the rest.
 */
export function stageDistribution(stages: DashboardStageDef[], allValues: DashboardStageValues[]): { label: string; count: number }[] {
  const counts = stages.map((s) => ({ key: s.key, label: s.label, count: 0 }));
  let complete = 0;
  for (const values of allValues) {
    const snap = stageSnapshot(stages, values);
    if (snap.complete) complete++;
    else {
      const idx = currentStageIndex(stages, values);
      if (counts[idx]) counts[idx].count++;
    }
  }
  return [...counts.map(({ label, count }) => ({ label, count })), { label: "Complete", count: complete }];
}
