// The universities and deadlines report (2026-11-18): one country's
// universities — every one, or one — and their programmes' deadlines, by
// level and field.
//
//   Programmes: No selection   each university's deadlines: its rounds across
//                              the programmes that match, with how many
//               All            every matching programme, round by round
//               one programme  that programme's rounds (one university chosen)
//
// The Field list is the office's ten. Programmes are classified into the
// portal's own field groups (0243: programs.field_group); each of the ten is a
// set of those groups, and where one group holds two of the ten (Economics,
// Finance & Accounting) the programme's name and core field decide. A
// programme outside all ten (Medicine, Law, Architecture…) is in the report
// only with Field: No selection.
//
// Pure — no portal imports — so the unit tests load it under plain Node.
import { levelKey } from "../catalogueText.ts";
import { day } from "../studentReport.ts";
import type { RowTone, TableReport, TableRow } from "./tableReport.ts";

export type ReportLevel = "all" | "bachelors" | "masters" | "phd";
export const LEVEL_LABELS: Record<ReportLevel, string> = { all: "All levels", bachelors: "Bachelors", masters: "Masters", phd: "PhD" };

type FieldTest = (p: { group: string; text: string }) => boolean;
const FINANCE = /financ|bank|accounting|accountancy|fintech|insurance|actuar|audit/i;
const ENVIRONMENT = /environment|sustainab|ecolog|climate|renewable|energy/i;
const groups = (...g: string[]): FieldTest => (p) => g.includes(p.group);

/** The office's ten fields, in their order, each as the programmes it takes. */
export const REPORT_FIELDS: { slug: string; label: string; test: FieldTest }[] = [
  { slug: "engineering", label: "Engineering", test: (p) => p.group.startsWith("eng_") },
  { slug: "cs_it", label: "CS/IT", test: groups("computer_science", "data_ai") },
  {
    slug: "environmental_engineering",
    label: "Environmental Engineering/Sciences",
    test: (p) => p.group === "earth_environment" || (p.group.startsWith("eng_") && ENVIRONMENT.test(p.text)),
  },
  { slug: "arts_humanities", label: "Arts and Humanities", test: groups("humanities", "arts_media", "music_performing") },
  { slug: "social_sciences", label: "Social Sciences", test: groups("social_sciences", "psychology", "education") },
  { slug: "economics", label: "Economics", test: (p) => p.group === "economics_finance" && (/econom/i.test(p.text) || !FINANCE.test(p.text)) },
  { slug: "business_management", label: "Business/Management", test: groups("business") },
  { slug: "business_finance", label: "Business/Finance", test: (p) => p.group === "economics_finance" && FINANCE.test(p.text) },
  { slug: "environmental_sciences", label: "Environmental Sciences", test: groups("earth_environment") },
  { slug: "natural_sciences", label: "Natural Sciences", test: groups("natural_sciences", "life_sciences", "chemistry", "physics", "mathematics") },
];

export type DeadlinesFilters = {
  /** A destination id; nothing is shown without one. */
  country: string;
  /** "" for every university of the country, or one's id. */
  university: string;
  level: ReportLevel;
  /** "" for no selection, or one of REPORT_FIELDS' slugs. */
  field: string;
  /** "" for no selection (universities' deadlines), "all", or one programme's id. */
  programme: string;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function parseDeadlinesFilters(params: URLSearchParams | Record<string, string | string[] | undefined>): DeadlinesFilters {
  const get = (k: string) => {
    const raw = params instanceof URLSearchParams ? params.get(k) : params[k];
    return ((Array.isArray(raw) ? raw[0] : raw) ?? "").trim();
  };
  const country = get("country");
  const university = get("university");
  const level = get("level");
  const field = get("field");
  const programme = get("programme");
  const uni = UUID.test(university) ? university.toLowerCase() : "";
  return {
    country: UUID.test(country) ? country.toLowerCase() : "",
    university: uni,
    level: level in LEVEL_LABELS ? (level as ReportLevel) : "all",
    field: REPORT_FIELDS.some((f) => f.slug === field) ? field : "",
    // One programme only within one university.
    programme: programme === "all" ? "all" : uni && UUID.test(programme) ? programme.toLowerCase() : "",
  };
}

export type DeadlineRound = {
  label: string | null;
  startDate: string | null;
  deadline: string | null;
  startText: string | null;
  deadlineText: string | null;
  sortOrder: number;
};
export type DeadlineProgramme = {
  id: string;
  universityId: string;
  name: string;
  level: string | null;
  fieldGroup: string | null;
  coreField: string | null;
  rounds: DeadlineRound[];
};
export type DeadlineUniversity = { id: string; name: string; city: string | null; type: string | null };

/** The ten fields a programme is in. */
export function fieldsOf(p: Pick<DeadlineProgramme, "name" | "fieldGroup" | "coreField">): string[] {
  const probe = { group: p.fieldGroup ?? "", text: `${p.name} ${p.coreField ?? ""}` };
  return REPORT_FIELDS.filter((f) => f.test(probe)).map((f) => f.slug);
}

/** Whether a programme is at the level asked for: Bachelors finds "Bachelor's" and "BSc" too. */
export function atLevel(level: string | null, wanted: ReportLevel): boolean {
  return wanted === "all" || levelKey(level) === wanted;
}

const SOON_DAYS = 30;
const daysBetween = (from: string, to: string) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);

/** Whether a round's deadline has passed, is close, or is open — or is words ("Rolling"). */
export function deadlineStatus(r: Pick<DeadlineRound, "deadline" | "deadlineText">, today: string): { label: string; tone: RowTone | null } {
  if (!r.deadline) return r.deadlineText ? { label: r.deadlineText, tone: null } : { label: "No deadline on file", tone: "muted" };
  const left = daysBetween(today, r.deadline);
  if (left < 0) return { label: "Closed", tone: "muted" };
  if (left === 0) return { label: "Closes today", tone: "bad" };
  if (left <= SOON_DAYS) return { label: `Closes in ${left} day${left === 1 ? "" : "s"}`, tone: "warn" };
  return { label: "Open", tone: "good" };
}

const applyBy = (r: DeadlineRound) => day(r.deadline) ?? r.deadlineText ?? "—";
const starts = (r: DeadlineRound) => day(r.startDate) ?? r.startText ?? "—";
const byRound = (a: DeadlineRound, b: DeadlineRound) =>
  (a.deadline ?? "9999").localeCompare(b.deadline ?? "9999") || a.sortOrder - b.sortOrder || (a.label ?? "").localeCompare(b.label ?? "");
const NO_ROUND: DeadlineRound = { label: null, startDate: null, deadline: null, startText: null, deadlineText: null, sortOrder: 0 };

export function buildDeadlinesReport(
  input: { countryName: string | null; universities: readonly DeadlineUniversity[]; programmes: readonly DeadlineProgramme[] },
  filters: DeadlinesFilters,
  meta: { preparedOn: string; preparedBy: string | null; today: string }
): TableReport {
  const fieldLabel = REPORT_FIELDS.find((f) => f.slug === filters.field)?.label ?? null;
  const unis = input.universities.filter((u) => !filters.university || u.id.toLowerCase() === filters.university);
  const uniIds = new Set(unis.map((u) => u.id));
  const programmes = input.programmes
    .filter((p) => uniIds.has(p.universityId))
    .filter((p) => atLevel(p.level, filters.level))
    .filter((p) => !filters.field || fieldsOf(p).includes(filters.field))
    .filter((p) => filters.programme === "" || filters.programme === "all" || p.id.toLowerCase() === filters.programme);
  const chosenProgramme = filters.programme && filters.programme !== "all" ? input.programmes.find((p) => p.id.toLowerCase() === filters.programme) : null;

  const describe = [
    input.countryName ?? "Choose a country",
    filters.university ? (unis[0]?.name ?? "That university") : "All universities",
    LEVEL_LABELS[filters.level],
    fieldLabel ?? "Any field",
    filters.programme === "all" ? "All programmes" : chosenProgramme ? chosenProgramme.name : "Universities' deadlines",
  ].join(" · ");

  const rows: TableRow[] = [];
  let open = 0;
  let soon = 0;
  let closed = 0;
  const tally = (tone: RowTone | null, label: string) => {
    if (tone === "good") open++;
    else if (tone === "warn" || tone === "bad") soon++;
    else if (label === "Closed") closed++;
  };
  const sortedUnis = [...unis].sort((a, b) => a.name.localeCompare(b.name, "en", { sensitivity: "base" }));
  const groupOf = (u: DeadlineUniversity) => [u.name, u.city, u.type ? (u.type === "public" ? "Public" : u.type === "private" ? "Private" : u.type) : null].filter(Boolean).join(" · ");

  if (filters.programme === "") {
    // Each university's deadlines: its programmes' rounds, the same round counted once with how many share it.
    for (const u of sortedUnis) {
      const own = programmes.filter((p) => p.universityId === u.id);
      if (own.length === 0) continue;
      const shared = new Map<string, { round: DeadlineRound; count: number }>();
      for (const p of own) {
        for (const r of p.rounds.length ? p.rounds : [NO_ROUND]) {
          const key = [r.label ?? "", r.deadline ?? "", r.deadlineText ?? "", r.startDate ?? "", r.startText ?? ""].join("|");
          const at = shared.get(key);
          if (at) at.count++;
          else shared.set(key, { round: r, count: 1 });
        }
      }
      for (const { round, count } of [...shared.values()].sort((a, b) => byRound(a.round, b.round))) {
        const status = deadlineStatus(round, meta.today);
        tally(status.tone, status.label);
        rows.push({
          group: groupOf(u),
          tone: status.tone,
          cells: { round: round.label ?? "—", applyBy: applyBy(round), starts: starts(round), programmes: `${count} of ${own.length}`, status: status.label },
        });
      }
    }
  } else {
    for (const u of sortedUnis) {
      const own = programmes
        .filter((p) => p.universityId === u.id)
        .sort((a, b) => a.name.localeCompare(b.name, "en", { sensitivity: "base" }) || (a.level ?? "").localeCompare(b.level ?? ""));
      for (const p of own) {
        const fields = fieldsOf(p).map((slug) => REPORT_FIELDS.find((f) => f.slug === slug)!.label);
        for (const r of p.rounds.length ? [...p.rounds].sort(byRound) : [NO_ROUND]) {
          const status = deadlineStatus(r, meta.today);
          tally(status.tone, status.label);
          rows.push({
            group: groupOf(u),
            tone: status.tone,
            cells: {
              programme: p.name,
              level: p.level ?? "—",
              field: fields.join(", ") || "—",
              round: r.label ?? "—",
              applyBy: applyBy(r),
              starts: starts(r),
              status: status.label,
            },
          });
        }
      }
    }
  }

  const universitiesShown = new Set(rows.map((r) => r.group)).size;
  return {
    title: "Universities and deadlines",
    filters: describe,
    preparedOn: meta.preparedOn,
    preparedBy: meta.preparedBy,
    summary: [
      { label: "Universities", value: String(universitiesShown) },
      { label: "Programmes", value: String(programmes.length) },
      { label: "Open", value: String(open), tone: "good" },
      { label: `Closing within ${SOON_DAYS} days`, value: String(soon), tone: "warn" },
      { label: "Closed", value: String(closed), tone: "muted" },
    ],
    columns:
      filters.programme === ""
        ? [
            { key: "round", header: "Round", width: 1.4 },
            { key: "applyBy", header: "Apply by", width: 1.3 },
            { key: "starts", header: "Course starts", width: 1.3 },
            { key: "programmes", header: "Programmes", width: 1 },
            { key: "status", header: "Status", width: 1.3 },
          ]
        : [
            { key: "programme", header: "Programme", width: 3 },
            { key: "level", header: "Level", width: 0.9 },
            { key: "field", header: "Field", width: 1.6 },
            { key: "round", header: "Round", width: 1 },
            { key: "applyBy", header: "Apply by", width: 1.1 },
            { key: "starts", header: "Course starts", width: 1.1 },
            { key: "status", header: "Status", width: 1.2 },
          ],
    rows,
    empty: input.countryName ? "No programme matches what is chosen." : "Choose a country to see its universities' deadlines.",
    note: `Apply by is each round's last date to apply, as the catalogue has it; Closing soon is within ${SOON_DAYS} days of today. With Programmes: No selection, a university's rounds are shown once each, with how many of its programmes share that date.`,
  };
}
