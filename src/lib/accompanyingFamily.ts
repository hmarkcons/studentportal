// A student's accompanying family — spouse(s) and children — and what the
// office charges for them (0350): a consultancy fee per spouse and per child,
// €500 and €250 as standard, set per country in Setup and changeable for one
// student at registration. Registration records who comes; an agreement takes
// a copy when it is made and adds their fees to the payment chart, spread over
// the instalments; the invoice is pre-filled with the same.
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

export type FamilyColumns = { spouse_count: number; children_count: number; spouse_fee: number | null; child_fee: number | null };

/**
 * What an agreement takes from the registration when it is made: the family,
 * and each fee — the student's own if staff set one, else the country's. A
 * country that does not allow family, a backup country's agreement
 * (administrative fee only) and a visa-only one carry none.
 */
export function familyForAgreement(
  lead: { spouse_count?: Num; children_count?: Num; spouse_fee?: Num; child_fee?: Num } | null | undefined,
  destination: { allows_dependants?: boolean | null; spouse_fee?: Num; child_fee?: Num } | null | undefined,
  { isBackup = false, visaOnly = false }: { isBackup?: boolean; visaOnly?: boolean } = {}
): FamilyColumns {
  const none: FamilyColumns = { spouse_count: 0, children_count: 0, spouse_fee: null, child_fee: null };
  if (!lead || !destination?.allows_dependants || isBackup || visaOnly) return none;
  const spouses = Math.max(0, Math.floor(num(lead.spouse_count) ?? 0));
  const children = Math.max(0, Math.floor(num(lead.children_count) ?? 0));
  if (spouses === 0 && children === 0) return none;
  return {
    spouse_count: spouses,
    children_count: children,
    spouse_fee: spouses > 0 ? (num(lead.spouse_fee) ?? num(destination.spouse_fee) ?? STANDARD_SPOUSE_FEE) : null,
    child_fee: children > 0 ? (num(lead.child_fee) ?? num(destination.child_fee) ?? STANDARD_CHILD_FEE) : null,
  };
}

export type ParsedFamily = FamilyColumns;

/**
 * The family a registration form posted, or null when the form carries no
 * family fields (an older form, or a country that does not allow family — the
 * section is not shown and nothing is changed). Counts are whole numbers in
 * range for the kind chosen; a fee is kept only when there is someone to
 * charge it for.
 */
export function parseFamily(form: { has(name: string): boolean; get(name: string): unknown }): ParsedFamily | { error: string } | null {
  if (!form.has("family_kind")) return null;
  const kind = String(form.get("family_kind") ?? "none") as FamilyKind;
  if (!(kind in FAMILY_KIND_LABELS)) return { error: "Choose who is accompanying the student." };
  if (kind === "none") return { spouse_count: 0, children_count: 0, spouse_fee: null, child_fee: null };

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

  return { spouse_count: spouses ?? 0, children_count: children ?? 0, spouse_fee: spouseFee.value, child_fee: childFee.value };
}
