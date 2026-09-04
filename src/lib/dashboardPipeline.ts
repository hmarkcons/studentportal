// The Dashboard's destination-level pipeline (Admission Docs, Visa Status,
// Travel, Enrollment, ...) — distinct from destinations.pipeline_stages,
// which tracks a single application's progress through admission stages at
// one university. This one tracks a registered student's overall progress
// toward a destination as a whole, set by staff, shown read-only to the
// student on their own portal dashboard. See migration 0101.

export type DashboardStageType = "checkbox" | "select" | "date";

export type DashboardStageDef = {
  key: string;
  label: string;
  type: DashboardStageType;
  options: string[];
};

export type DashboardStageValues = Record<string, string>;

// Staff types stages in the exact "Label: opt1/opt2" notation the source
// doc itself uses — one per line. A single option (no "/") is a checkbox
// (the option text is the done-value, e.g. "Completed"); "Date" alone is a
// date field; 2+ options is a select. Duplicate labels within the same
// list (e.g. two separate "Appointment" stages) get a numeric suffix so
// keys stay unique.
export function parseDashboardStagesText(text: string): DashboardStageDef[] {
  const lines = text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  const stages = lines.map((line) => {
    const colonIndex = line.indexOf(":");
    const labelPart = (colonIndex === -1 ? line : line.slice(0, colonIndex)).trim();
    const optsPart = colonIndex === -1 ? "" : line.slice(colonIndex + 1).trim();
    const key = labelPart
      .toLowerCase()
      .replace(/&/g, "and")
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "");
    const options = optsPart
      ? optsPart.split("/").map((s) => s.trim()).filter(Boolean)
      : ["Completed"];
    let type: DashboardStageType = "select";
    if (options.length <= 1) {
      type = (options[0] ?? "").toLowerCase() === "date" ? "date" : "checkbox";
    }
    return { key, label: labelPart, type, options: type === "date" ? [] : options };
  });

  const seen = new Map<string, number>();
  for (const s of stages) {
    const count = (seen.get(s.key) ?? 0) + 1;
    seen.set(s.key, count);
    if (count > 1) s.key = `${s.key}_${count}`;
  }
  return stages;
}

export function formatDashboardStagesText(stages: DashboardStageDef[]): string {
  return stages
    .map((s) => {
      if (s.type === "date") return `${s.label}: Date`;
      return `${s.label}: ${s.options.join("/")}`;
    })
    .join("\n");
}

// A set value reading as a negative/blocked outcome (Rejected, Failed,
// Unpaid, ...) is flagged so the UI can show it in red instead of the
// usual "done" green, even though a value being set at all still counts
// as "this stage has been reached" for progress purposes.
const NEGATIVE_KEYWORDS = ["reject", "fail", "unpaid", "pending", "waiting"];
export function isNegativeValue(value: string | undefined): boolean {
  if (!value) return false;
  const v = value.toLowerCase();
  return NEGATIVE_KEYWORDS.some((k) => v.includes(k));
}

// The first stage with no value set yet is "current"; every stage before
// it counts as done. If every stage has a value, the whole thing reads as
// complete (current = last stage).
export function currentStageIndex(stages: DashboardStageDef[], values: DashboardStageValues): number {
  const idx = stages.findIndex((s) => !values[s.key]);
  return idx === -1 ? stages.length - 1 : idx;
}
