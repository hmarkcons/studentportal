// Applications & portal logins: every registered student's applications, each
// with where it stands and the university-portal login saved against it — for
// the Processing team and Super Admin, at /reports/applications-logins and in
// its PDF and Excel downloads. All three are built from what this returns, so
// they cannot disagree.
//
// Where an application stands is the Applications table's own reading of its
// stage (stageGroup): in progress, an offer or later, withdrawn / declined, or
// rejected — so this report and that table never call one application two
// things. Its order within a student is that table's too: offers first, then
// the priority staff gave them.
//
// The logins are the ones kept against each application (0347,
// application_logins), passwords included: the office asked for them in full.
// Whoever can open this report can already Reveal each of them on the
// student's record.
//
// Pure: no database here. applicationsReportLoad.ts reads the rows; the unit
// tests drive this directly (scripts/applications-report-test.mjs).

// Relative, with their extensions: the unit tests load this under plain Node.
import { GROUP_LABEL, stageGroup, stageLabel, stageProgress, type StageGroup } from "./applicationTable.ts";
import { parseStoredLogin } from "./portalLink.ts";
import { linkHref } from "./catalogueText.ts";
import { levelLabel } from "./portalWelcomeEmail.ts";
import { credentialLabel } from "./studentCredentials.ts";
import { UUID, param, parseStudentIds, reportFileName, type ReportParams } from "./reportFilters.ts";

export type { StageGroup };

/** Offer or later first, as the Applications table orders them. */
export const GROUPS: readonly StageGroup[] = ["accepted", "progress", "closed", "rejected"];

export const GROUP_LABELS: Record<StageGroup, string> = {
  ...GROUP_LABEL,
  closed: "Withdrawn / declined",
};

/** Green for an offer, blue while it runs, grey once it has stopped, red when refused. */
export const GROUP_COLORS: Record<StageGroup, string> = {
  accepted: "#16A34A",
  progress: "#2563EB",
  closed: "#6B7280",
  rejected: "#DC2626",
};

/** "A week left": a deadline this many days away or fewer, today included, is highlighted. */
export const DEADLINE_SOON_DAYS = 7;

/** Whole days from one calendar day to another ("2026-11-03" to "2026-11-06" is 3). */
export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}

/** "Due today", "Due tomorrow", "3 days left". */
export function daysLeftLabel(days: number): string {
  if (days <= 0) return "Due today";
  if (days === 1) return "Due tomorrow";
  return `${days} days left`;
}

// ------------------------------------------------------------------ inputs

export type AppStudentInput = {
  id: string;
  name: string;
  code: string | null;
  intake: string | null;
  officerId: string | null;
  countries: { id: string; name: string }[];
};

/** What the report needs of an ApplicationRow (applicationRows.ts), in its order. */
export type AppInput = {
  id: string;
  studentId: string;
  number: number;
  universityName: string;
  city: string | null;
  country: string | null;
  destinationId: string | null;
  programName: string | null;
  level: string | null;
  intake: string | null;
  roundLabel: string | null;
  deadline: string | null;
  stage: string;
  pipeline: string[];
  finalized: boolean;
  finalizedBadge: string | null;
  portalLink: string | null;
};

/** A row of application_logins() (0347). */
export type LoginRowInput = {
  application_id: string;
  credential_type: string;
  plaintext: string | null;
  updated_at: string | null;
};

// ------------------------------------------------------------------ outputs

export type AppLogin = {
  credentialType: string;
  /** "University portal", or what a tracker named it. */
  label: string;
  username: string;
  password: string;
  link: string | null;
  updatedAt: string | null;
};

export type ReportApplication = {
  id: string;
  number: number;
  university: string;
  city: string | null;
  country: string | null;
  destinationId: string | null;
  programme: string | null;
  level: string | null;
  intake: string | null;
  round: string | null;
  deadline: string | null;
  /** Still in progress and its deadline gone by. */
  deadlinePassed: boolean;
  /** Still in progress and its deadline within the week: today, or up to DEADLINE_SOON_DAYS days away. */
  deadlineSoon: boolean;
  /** Days from today to the deadline (0 is today); null with no deadline. */
  daysLeft: number | null;
  stage: string;
  stageLabel: string;
  group: StageGroup;
  /** "Step 3 of 9" along the destination's stages, when the stage is one of them. */
  step: { step: number; of: number } | null;
  finalized: boolean;
  finalizedBadge: string | null;
  /** Where the programme says to apply, when it is a real http(s) address (linkHref). */
  portalLink: string | null;
  /** What "Open portal" opens: the saved login's own link (where it signs in), else the programme's. */
  portalUrl: string | null;
  logins: AppLogin[];
};

export type AppCounts = {
  total: number;
  accepted: number;
  progress: number;
  closed: number;
  rejected: number;
  /** Applications with at least one login saved against them. */
  withLogin: number;
  /** In progress with a deadline a week or less away (deadlineSoon). */
  dueSoon: number;
};

export type AppReportStudent = {
  id: string;
  name: string;
  code: string | null;
  intake: string | null;
  officerId: string | null;
  officer: string | null;
  countries: string[];
  /** Every application they have, before the filters, so "3 of 12 shown" can be said. */
  allApplications: number;
  applications: ReportApplication[];
  counts: AppCounts;
};

export type ApplicationsReport = {
  today: string;
  students: AppReportStudent[];
  totals: AppCounts & { students: number; withApplications: number };
};

// ------------------------------------------------------------------ filters

export type AppStatusFilter = "all" | StageGroup | "ended";
export type AppShow = "all" | "with" | "without";
export type AppLoginFilter = "all" | "saved" | "missing";

export type ApplicationsFilters = {
  /** Particular students (ids), or none for everyone. */
  students: string[];
  /** "" for everyone, "none" for students with no processing officer, or a staff id. */
  officer: string;
  /** "" for every destination, or the destination id the application's university is in. */
  country: string;
  status: AppStatusFilter;
  show: AppShow;
  login: AppLoginFilter;
};

export const DEFAULT_APP_FILTERS: ApplicationsFilters = { students: [], officer: "", country: "", status: "all", show: "all", login: "all" };

export const STATUS_FILTER_LABELS: Record<AppStatusFilter, string> = {
  all: "Every status",
  progress: "In progress",
  accepted: "Offer or later",
  ended: "Ended (rejected, withdrawn, declined)",
  closed: "Withdrawn / declined",
  rejected: "Rejected",
};

export const SHOW_LABELS: Record<AppShow, string> = {
  all: "All registered students",
  with: "Students with applications",
  without: "Students with no application yet",
};

export const LOGIN_FILTER_LABELS: Record<AppLoginFilter, string> = {
  all: "With or without a login",
  saved: "Login saved",
  missing: "No login saved",
};

const STATUSES: readonly AppStatusFilter[] = ["all", "progress", "accepted", "ended", "closed", "rejected"];

export function parseApplicationsFilters(params: ReportParams): ApplicationsFilters {
  const officer = param(params, "officer");
  const country = param(params, "country");
  const status = param(params, "status") as AppStatusFilter;
  const show = param(params, "show");
  const login = param(params, "login");
  return {
    students: parseStudentIds(params),
    officer: officer === "none" || UUID.test(officer) ? officer : "",
    country: UUID.test(country) ? country.toLowerCase() : "",
    status: STATUSES.includes(status) ? status : "all",
    show: show === "with" || show === "without" ? show : "all",
    login: login === "saved" || login === "missing" ? login : "all",
  };
}

/** The query string for these filters, leaving out the defaults. Starts with "?" when not empty. */
export function applicationsQuery(f: ApplicationsFilters, extra: Record<string, string> = {}): string {
  const q = new URLSearchParams();
  if (f.students.length) q.set("students", f.students.join(","));
  if (f.officer) q.set("officer", f.officer);
  if (f.country) q.set("country", f.country);
  if (f.status !== "all") q.set("status", f.status);
  if (f.show !== "all") q.set("show", f.show);
  if (f.login !== "all") q.set("login", f.login);
  for (const [k, v] of Object.entries(extra)) q.set(k, v);
  const s = q.toString();
  return s ? `?${s}` : "";
}

/** Whether any filter narrows the applications themselves (not only which students). */
export function narrowsApplications(f: ApplicationsFilters): boolean {
  return f.country !== "" || f.status !== "all" || f.login !== "all";
}

/** "Student: Ali Raza · Italy (Public) · In progress · No login saved", for the PDF's heading and the workbook. */
export function describeApplicationsFilters(
  f: ApplicationsFilters,
  officerName: (id: string) => string | null,
  countryName: (id: string) => string | null,
  studentName: (id: string) => string | null = () => null
): string {
  const parts: string[] = [];
  if (f.students.length === 1) parts.push(`Student: ${studentName(f.students[0]) ?? "one student"}`);
  else if (f.students.length > 1) parts.push(`${f.students.length} selected students`);
  if (f.officer === "none") parts.push("No processing officer");
  else if (f.officer) parts.push(`Officer: ${officerName(f.officer) ?? "unknown"}`);
  if (f.country) parts.push(countryName(f.country) ?? "One destination");
  if (f.status !== "all") parts.push(STATUS_FILTER_LABELS[f.status]);
  if (f.login !== "all") parts.push(LOGIN_FILTER_LABELS[f.login]);
  if (f.show !== "all" || parts.length === 0) parts.push(SHOW_LABELS[f.show]);
  return parts.join(" · ");
}

// ------------------------------------------------------------------ building

/** The logins kept against each application, read and named; empty ones left out. */
export function loginsByApplication(rows: readonly LoginRowInput[] | null | undefined): Map<string, AppLogin[]> {
  const out = new Map<string, AppLogin[]>();
  for (const r of rows ?? []) {
    const stored = parseStoredLogin(r.plaintext);
    if (!stored.username.trim() && !stored.password.trim() && !stored.link) continue;
    const login: AppLogin = {
      credentialType: r.credential_type,
      label: credentialLabel(r.credential_type),
      username: stored.username,
      password: stored.password,
      link: stored.link,
      updatedAt: r.updated_at,
    };
    (out.get(r.application_id) ?? out.set(r.application_id, []).get(r.application_id)!).push(login);
  }
  // The university portal itself first, then any other the office named, by name.
  const rank = (l: AppLogin) => (l.credentialType === "university_portal" ? 0 : 1);
  for (const list of out.values()) list.sort((a, b) => rank(a) - rank(b) || a.label.localeCompare(b.label));
  return out;
}

export function countApplications(apps: readonly Pick<ReportApplication, "group" | "logins" | "deadlineSoon">[]): AppCounts {
  const c: AppCounts = { total: apps.length, accepted: 0, progress: 0, closed: 0, rejected: 0, withLogin: 0, dueSoon: 0 };
  for (const a of apps) {
    c[a.group]++;
    if (a.logins.length) c.withLogin++;
    if (a.deadlineSoon) c.dueSoon++;
  }
  return c;
}

function keepApplication(a: ReportApplication, f: ApplicationsFilters): boolean {
  if (f.country && (a.destinationId ?? "").toLowerCase() !== f.country) return false;
  if (f.status === "ended" ? a.group !== "closed" && a.group !== "rejected" : f.status !== "all" && a.group !== f.status) return false;
  if (f.login === "saved" && a.logins.length === 0) return false;
  if (f.login === "missing" && a.logins.length > 0) return false;
  return true;
}

export function buildApplicationsReport(input: {
  students: readonly AppStudentInput[];
  /** Every application, in the Applications table's order (loadApplicationRows). */
  applications: readonly AppInput[];
  logins: ReadonlyMap<string, AppLogin[]>;
  officerNames: ReadonlyMap<string, string>;
  filters: ApplicationsFilters;
  /** The office's day, "2026-11-03". */
  today: string;
}): ApplicationsReport {
  const { filters: f, today } = input;
  const appsOf = new Map<string, ReportApplication[]>();
  for (const a of input.applications) {
    const group = stageGroup(a.stage, a.pipeline);
    const deadline = /^\d{4}-\d{2}-\d{2}/.test(a.deadline ?? "") ? a.deadline!.slice(0, 10) : null;
    const daysLeft = deadline ? daysBetween(today, deadline) : null;
    const logins = input.logins.get(a.id) ?? [];
    // A link field may hold words, or "javascript:…" (0304): only a real address is passed on.
    const portalLink = linkHref(a.portalLink);
    const app: ReportApplication = {
      id: a.id,
      number: a.number,
      university: a.universityName,
      city: a.city,
      country: a.country,
      destinationId: a.destinationId,
      programme: a.programName,
      // "Bachelor's", not the stored "bachelors".
      level: levelLabel(a.level),
      intake: a.intake,
      round: a.roundLabel,
      deadline,
      deadlinePassed: Boolean(deadline && deadline < today && group === "progress"),
      // Only while it runs: once there is an offer, or it has ended, the date no longer presses.
      deadlineSoon: group === "progress" && daysLeft !== null && daysLeft >= 0 && daysLeft <= DEADLINE_SOON_DAYS,
      daysLeft,
      stage: a.stage,
      stageLabel: stageLabel(a.stage),
      group,
      step: stageProgress(a.stage, a.pipeline),
      finalized: a.finalized,
      finalizedBadge: a.finalized ? a.finalizedBadge?.trim() || "University finalized" : null,
      portalLink,
      portalUrl: logins.find((l) => l.link)?.link ?? portalLink,
      logins,
    };
    (appsOf.get(a.studentId) ?? appsOf.set(a.studentId, []).get(a.studentId)!).push(app);
  }

  const chosen = new Set(f.students);
  const narrowing = narrowsApplications(f);
  const students: AppReportStudent[] = [];
  for (const s of input.students) {
    if (chosen.size && !chosen.has(s.id.toLowerCase())) continue;
    if (f.officer === "none" ? s.officerId !== null : f.officer && s.officerId !== f.officer) continue;
    const all = appsOf.get(s.id) ?? [];
    let shown: ReportApplication[];
    if (f.show === "without") {
      // Nothing to narrow: a student here has no application. The destination
      // still picks those pursuing it.
      if (all.length > 0) continue;
      if (f.country && !s.countries.some((c) => c.id.toLowerCase() === f.country)) continue;
      shown = [];
    } else {
      shown = all.filter((a) => keepApplication(a, f));
      // With a filter on the applications, a student none of whose pass it is left out.
      if ((f.show === "with" || narrowing) && shown.length === 0) continue;
    }
    students.push({
      id: s.id,
      name: s.name.trim() || "Unnamed student",
      code: s.code,
      intake: s.intake,
      officerId: s.officerId,
      officer: s.officerId ? input.officerNames.get(s.officerId) ?? null : null,
      countries: s.countries.map((c) => c.name),
      allApplications: all.length,
      applications: shown,
      counts: countApplications(shown),
    });
  }
  students.sort((a, b) => a.name.localeCompare(b.name, "en", { sensitivity: "base" }) || (a.code ?? "").localeCompare(b.code ?? ""));

  const totals = students.reduce(
    (t, s) => {
      t.total += s.counts.total;
      t.accepted += s.counts.accepted;
      t.progress += s.counts.progress;
      t.closed += s.counts.closed;
      t.rejected += s.counts.rejected;
      t.withLogin += s.counts.withLogin;
      t.dueSoon += s.counts.dueSoon;
      if (s.counts.total > 0) t.withApplications++;
      return t;
    },
    { students: students.length, withApplications: 0, total: 0, accepted: 0, progress: 0, closed: 0, rejected: 0, withLogin: 0, dueSoon: 0 }
  );
  return { today, students, totals };
}

/** "HMC-Applications-Logins-2026-11-03.pdf", or named after the one student it is for. */
export function applicationsFileName(today: string, ext: "pdf" | "xlsx", only?: { name: string; code: string | null } | null): string {
  return reportFileName("Applications-Logins", today, ext, only);
}
