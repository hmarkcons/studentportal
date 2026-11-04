// A student's accompanying family — spouse(s) and children — and what the
// office charges for them (0350): a consultancy fee per spouse and per child,
// €500 and €250 as standard, set per country in Setup and changeable for one
// student at registration. Registration records who comes; an agreement takes
// a copy when it is made and adds their fees to the payment chart, spread over
// the instalments; the invoice is pre-filled with the same. Each spouse and
// child is named, with their date of birth (0351), and the agreement lists them.
//
// Pure, with no imports, so the unit tests load it under plain Node.

export const MAX_SPOUSES = 4;
export const MAX_CHILDREN = 10;
export const STANDARD_SPOUSE_FEE = 500;
export const STANDARD_CHILD_FEE = 250;

/** Who comes with the student, as registration offers it. */
export type FamilyKind = "none" | "spouse" | "spouse_children" | "children";

export const FAMILY_KIND_LABELS: Record<FamilyKind, string> = {
  none: "No family accompanying",
  spouse: "Spouse",
  spouse_children: "Spouse and children",
  children: "Children only",
};

export type Family = { spouses: number; children: number; spouseFee: number; childFee: number };

/** One accompanying spouse or child, as registration records them (0351). */
export type FamilyMember = { relation: "spouse" | "child"; name: string; dob: string };

export const FAMILY_NAME_MAX = 120;

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** A real calendar date written YYYY-MM-DD, from 1900 to tomorrow (a Karachi today is still yesterday in UTC). */
export function isFamilyDob(value: string): boolean {
  if (!ISO_DATE.test(value)) return false;
  const [y, m, d] = value.split("-").map(Number);
  const at = new Date(Date.UTC(y, m - 1, d));
  if (at.getUTCFullYear() !== y || at.getUTCMonth() !== m - 1 || at.getUTCDate() !== d) return false;
  const tomorrow = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
  return y >= 1900 && value <= tomorrow;
}

/**
 * The members as stored — a JSON list — made safe to print: anything that is
 * not a named spouse or child is dropped, and a date that is not one is blank.
 * Spouses first, then children, as they were entered.
 */
export function familyMembersOf(value: unknown): FamilyMember[] {
  if (!Array.isArray(value)) return [];
  const members = value.flatMap((m): FamilyMember[] => {
    if (!m || typeof m !== "object") return [];
    const r = m as Record<string, unknown>;
    const relation = r.relation === "spouse" || r.relation === "child" ? r.relation : null;
    const name = typeof r.name === "string" ? r.name.trim().slice(0, FAMILY_NAME_MAX) : "";
    const dob = typeof r.dob === "string" && isFamilyDob(r.dob) ? r.dob : "";
    return relation && name ? [{ relation, name, dob }] : [];
  });
  return [...members.filter((m) => m.relation === "spouse"), ...members.filter((m) => m.relation === "child")];
}

/** Each member's label: "Spouse" alone or "Spouse 1", "Spouse 2"; "Child" alone or "Child 1", … */
export function familyMemberLabels(members: FamilyMember[]): string[] {
  const spouses = members.filter((m) => m.relation === "spouse").length;
  const children = members.filter((m) => m.relation === "child").length;
  let s = 0;
  let c = 0;
  return members.map((m) => (m.relation === "spouse" ? (spouses > 1 ? `Spouse ${++s}` : "Spouse") : children > 1 ? `Child ${++c}` : "Child"));
}

/** "Spouse: Sara Khan (date of birth 3/14/1996); Child: Ali Khan (…)" — dates written by the caller's formatter. */
export function familyMembersText(members: FamilyMember[], formatDate: (iso: string) => string = (d) => d): string {
  const labels = familyMemberLabels(members);
  return members.map((m, i) => `${labels[i]}: ${m.name}${m.dob ? ` (date of birth ${formatDate(m.dob)})` : ""}`).join("; ");
}

export function familyKindOf(spouses: number, children: number): FamilyKind {
  if (spouses > 0 && children > 0) return "spouse_children";
  if (spouses > 0) return "spouse";
  if (children > 0) return "children";
  return "none";
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/** The family's consultancy fees together. */
export function familyFee(f: Family | null | undefined): number {
  if (!f) return 0;
  return round2(f.spouses * f.spouseFee + f.children * f.childFee);
}

export function hasFamily(f: Family | null | undefined): f is Family {
  return Boolean(f && (f.spouses > 0 || f.children > 0));
}

/** "1 spouse and 2 children", "2 spouses", "1 child" — or "" for nobody. */
export function familyWords(f: Pick<Family, "spouses" | "children"> | null | undefined): string {
  if (!f) return "";
  const parts: string[] = [];
  if (f.spouses > 0) parts.push(`${f.spouses} spouse${f.spouses === 1 ? "" : "s"}`);
  if (f.children > 0) parts.push(`${f.children} ${f.children === 1 ? "child" : "children"}`);
  return parts.join(" and ");
}

type Num = number | string | null | undefined;
const num = (v: Num): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "string" ? Number(v) : v;
  return Number.isFinite(n) ? n : null;
};

/**
 * The family as an agreement recorded it, or null when it recorded none. Fees
 * a row left empty fall back to the standard ones, as the agreement was made
 * with them.
 */
export function agreementFamily(row: { spouse_count?: Num; children_count?: Num; spouse_fee?: Num; child_fee?: Num } | null | undefined): Family | null {
  if (!row) return null;
  const spouses = Math.max(0, Math.floor(num(row.spouse_count) ?? 0));
  const children = Math.max(0, Math.floor(num(row.children_count) ?? 0));
  if (spouses === 0 && children === 0) return null;
  return { spouses, children, spouseFee: num(row.spouse_fee) ?? STANDARD_SPOUSE_FEE, childFee: num(row.child_fee) ?? STANDARD_CHILD_FEE };
}

export type FamilyColumns = {
  spouse_count: number;
  children_count: number;
  spouse_fee: number | null;
  child_fee: number | null;
  /** Each of them by name and date of birth (0351). */
  family_members: FamilyMember[];
};

/**
 * What an agreement takes from the registration when it is made: the family,
 * and each fee — the student's own if staff set one, else the country's. A
 * country that does not allow family, a backup country's agreement
 * (administrative fee only) and a visa-only one carry none.
 */
export function familyForAgreement(
  lead: { spouse_count?: Num; children_count?: Num; spouse_fee?: Num; child_fee?: Num; family_members?: unknown } | null | undefined,
  destination: { allows_dependants?: boolean | null; spouse_fee?: Num; child_fee?: Num } | null | undefined,
  { isBackup = false, visaOnly = false }: { isBackup?: boolean; visaOnly?: boolean } = {}
): FamilyColumns {
  const none: FamilyColumns = { spouse_count: 0, children_count: 0, spouse_fee: null, child_fee: null, family_members: [] };
  if (!lead || !destination?.allows_dependants || isBackup || visaOnly) return none;
  const spouses = Math.max(0, Math.floor(num(lead.spouse_count) ?? 0));
  const children = Math.max(0, Math.floor(num(lead.children_count) ?? 0));
  if (spouses === 0 && children === 0) return none;
  // Only as many of each as are counted — the names never outnumber the fees.
  const members = familyMembersOf(lead.family_members);
  return {
    spouse_count: spouses,
    children_count: children,
    spouse_fee: spouses > 0 ? (num(lead.spouse_fee) ?? num(destination.spouse_fee) ?? STANDARD_SPOUSE_FEE) : null,
    child_fee: children > 0 ? (num(lead.child_fee) ?? num(destination.child_fee) ?? STANDARD_CHILD_FEE) : null,
    family_members: [
      ...members.filter((m) => m.relation === "spouse").slice(0, spouses),
      ...members.filter((m) => m.relation === "child").slice(0, children),
    ],
  };
}

export type ParsedFamily = FamilyColumns;

/**
 * The family a registration form posted, or null when the form carries no
 * family fields (an older form, or a country that does not allow family — the
 * section is not shown and nothing is changed). Counts are whole numbers in
 * range for the kind chosen; a fee is kept only when there is someone to
 * charge it for; and each of them is named, with a date of birth (0351) —
 * spouse_name / spouse_dob and child_name / child_dob, one of each per person.
 */
export function parseFamily(form: {
  has(name: string): boolean;
  get(name: string): unknown;
  getAll(name: string): unknown[];
}): ParsedFamily | { error: string } | null {
  if (!form.has("family_kind")) return null;
  const kind = String(form.get("family_kind") ?? "none") as FamilyKind;
  if (!(kind in FAMILY_KIND_LABELS)) return { error: "Choose who is accompanying the student." };
  if (kind === "none") return { spouse_count: 0, children_count: 0, spouse_fee: null, child_fee: null, family_members: [] };

  const wantsSpouse = kind === "spouse" || kind === "spouse_children";
  const wantsChildren = kind === "children" || kind === "spouse_children";
  const count = (name: string) => {
    const raw = String(form.get(name) ?? "").trim();
    const n = Number(raw);
    return raw === "" || !Number.isInteger(n) ? null : n;
  };
  const fee = (name: string) => {
    const raw = String(form.get(name) ?? "").trim();
    if (raw === "") return { value: null as number | null };
    const n = Number(raw);
    return Number.isFinite(n) && n >= 0 ? { value: round2(n) } : { error: true };
  };

  const spouses = wantsSpouse ? count("spouse_count") : 0;
  const children = wantsChildren ? count("children_count") : 0;
  if (wantsSpouse && (spouses === null || spouses < 1 || spouses > MAX_SPOUSES)) return { error: `Give the number of spouses, from 1 to ${MAX_SPOUSES}.` };
  if (wantsChildren && (children === null || children < 1 || children > MAX_CHILDREN)) return { error: `Give the number of children, from 1 to ${MAX_CHILDREN}.` };

  const spouseFee = wantsSpouse ? fee("spouse_fee") : { value: null };
  const childFee = wantsChildren ? fee("child_fee") : { value: null };
  if ("error" in spouseFee) return { error: "The fee per spouse must be a number of 0 or more." };
  if ("error" in childFee) return { error: "The fee per child must be a number of 0 or more." };

  const people = (relation: FamilyMember["relation"], n: number): FamilyMember[] | { error: string } => {
    const names = form.getAll(`${relation}_name`).map((v) => String(v ?? "").trim());
    const dobs = form.getAll(`${relation}_dob`).map((v) => String(v ?? "").trim());
    const out: FamilyMember[] = [];
    for (let i = 0; i < n; i++) {
      const who = n > 1 ? `${relation} ${i + 1}` : `the ${relation}`;
      const name = names[i] ?? "";
      if (!name) return { error: `Give the name of ${who}.` };
      if (name.length > FAMILY_NAME_MAX) return { error: `The name of ${who} is too long — ${FAMILY_NAME_MAX} characters at most.` };
      const dob = dobs[i] ?? "";
      if (!isFamilyDob(dob)) return { error: `Give the date of birth of ${who}.` };
      out.push({ relation, name, dob });
    }
    return out;
  };
  const spouseList = people("spouse", spouses ?? 0);
  if ("error" in spouseList) return spouseList;
  const childList = people("child", children ?? 0);
  if ("error" in childList) return childList;

  return {
    spouse_count: spouses ?? 0,
    children_count: children ?? 0,
    spouse_fee: spouseFee.value,
    child_fee: childFee.value,
    family_members: [...spouseList, ...childList],
  };
}
