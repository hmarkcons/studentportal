// What the student reports (Documents checklist, Applications & portal logins)
// read from their address the same way: a value, a list of chosen students,
// and the letters a downloaded file may be named with.
//
// Pure, with no imports, so the unit tests load the reports under plain Node.

export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** More than any office will tick, and short of an address too long to send. */
export const MAX_SELECTED_STUDENTS = 300;

export type ReportParams = URLSearchParams | Record<string, string | string[] | undefined>;

/** One value, trimmed; the first when there are several. */
export function param(params: ReportParams, key: string): string {
  const v = params instanceof URLSearchParams ? params.get(key) : params[key];
  return (Array.isArray(v) ? v[0] : v ?? "").trim();
}

/** Every value of a key, each split at commas: "students=a,b&students=c" is a, b and c. */
export function list(params: ReportParams, key: string): string[] {
  const raw = params instanceof URLSearchParams ? params.getAll(key) : [params[key] ?? []].flat();
  return raw.flatMap((v) => v.split(",")).map((v) => v.trim()).filter(Boolean);
}

/** The chosen students: ids only, each once, lower-cased as Postgres writes them, at most MAX_SELECTED_STUDENTS. */
export function parseStudentIds(params: ReportParams): string[] {
  return [...new Set(list(params, "students").filter((v) => UUID.test(v)).map((v) => v.toLowerCase()))].slice(0, MAX_SELECTED_STUDENTS);
}

/** Letters, digits and hyphens only: a file name every browser and Content-Disposition take as it is. */
export function fileSlug(v: string): string {
  return v
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^\w\s-]+/g, "")
    .trim()
    .replace(/[\s_]+/g, "-")
    .replace(/-+/g, "-");
}

/** "HMC-<what>-<student>-<Student ID>-<date>.<ext>", the student left out for a report of several. */
export function reportFileName(what: string, today: string, ext: string, only?: { name: string; code: string | null } | null): string {
  const who = only ? [fileSlug(only.name), only.code ? fileSlug(only.code) : ""].filter(Boolean).join("-") : "";
  return `HMC-${what}-${who ? `${who}-` : ""}${today}.${ext}`;
}
