// The company as agreements print it: the office line that opens every
// agreement, the name in its page header and under the consultant's
// signature, and the {{company_…}} placeholders a template's wording may use.
//
// Kept in agreement_settings (0288), edited by the Super Admin alone, and read
// by every student and staff agreement so they cannot disagree — the office
// line used to be written out fourteen times in code, and one copy had the
// landline wrong.
//
// Pure, so it is unit-tested (scripts/agreement-company-test.mjs).

export type AgreementCompany = {
  companyName: string;
  address: string;
  landline: string | null;
  mobile: string | null;
  email: string | null;
  website: string | null;
};

/** What every agreement printed before this was editable, word for word. */
export const DEFAULT_AGREEMENT_COMPANY: AgreementCompany = {
  companyName: "HMARK Consultants",
  address: "Suite 101, Dashtiyar Chambers, Opp. Urdu Federal University, Gulshan-e-Iqbal, Block 13-C, University Road, Karachi, Pakistan",
  landline: "021 34 999 777",
  mobile: null,
  email: null,
  website: null,
};

/** The agreement_settings columns this reads, for a select. */
export const AGREEMENT_COMPANY_COLUMNS = "company_name, office_address, landline, mobile, email, website";

export type AgreementCompanyRow = Partial<{
  company_name: string | null;
  office_address: string | null;
  landline: string | null;
  mobile: string | null;
  email: string | null;
  website: string | null;
}>;

const clean = (v: string | null | undefined) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim() : v);

/**
 * The company from a settings row. The name and address are required, so a
 * blank one keeps its default rather than printing an agreement from nobody;
 * a blank contact is left off. A row that could not be read at all (null)
 * prints exactly what agreements always said.
 */
export function companyFromSettings(row: AgreementCompanyRow | null | undefined): AgreementCompany {
  if (!row) return DEFAULT_AGREEMENT_COMPANY;
  const optional = (v: string | null | undefined, fallback: string | null) => (v === undefined ? fallback : clean(v) || null);
  return {
    companyName: clean(row.company_name) || DEFAULT_AGREEMENT_COMPANY.companyName,
    address: clean(row.office_address) || DEFAULT_AGREEMENT_COMPANY.address,
    landline: optional(row.landline, DEFAULT_AGREEMENT_COMPANY.landline),
    mobile: optional(row.mobile, null),
    email: optional(row.email, null),
    website: optional(row.website, null),
  };
}

/** The contacts that follow the address, as they print: "Landline #: …". */
export function companyContacts(company: AgreementCompany): string[] {
  return [
    company.landline && `Landline #: ${company.landline}`,
    company.mobile && `Mobile #: ${company.mobile}`,
    company.email && `Email: ${company.email}`,
    company.website && `Website: ${company.website}`,
  ].filter((line): line is string => Boolean(line));
}

/**
 * The line that opens every agreement:
 *
 *   HMARK Consultants - Office Address: Suite 101, … Pakistan. Landline #: 021 34 999 777
 *
 * With the defaults this is character for character what the builder's
 * templates and staff agreements printed, so nothing moves until the Super
 * Admin changes a field. Further contacts follow the landline, separated by
 * " | ".
 */
export function officeLine(company: AgreementCompany): string {
  const address = /[.!?]$/.test(company.address) ? company.address : `${company.address}.`;
  const contacts = companyContacts(company);
  return `${company.companyName} - Office Address: ${address}${contacts.length ? ` ${contacts.join(" | ")}` : ""}`;
}

/** Placeholders any agreement template may use, student or staff. */
export const COMPANY_MERGE_FIELDS: { key: string; label: string }[] = [
  { key: "company_name", label: "The company's name (Setup → Agreement templates → Company details)" },
  { key: "company_address", label: "The company's office address" },
  { key: "company_landline", label: "The company's landline number" },
  { key: "company_mobile", label: "The company's mobile number" },
  { key: "company_email", label: "The company's email address" },
  { key: "company_website", label: "The company's website" },
  { key: "office_line", label: "The whole office line, exactly as it opens the agreement" },
];

export function companyMergeVars(company: AgreementCompany): Record<string, string> {
  return {
    company_name: company.companyName,
    company_address: company.address,
    company_landline: company.landline ?? "",
    company_mobile: company.mobile ?? "",
    company_email: company.email ?? "",
    company_website: company.website ?? "",
    office_line: officeLine(company),
  };
}

/**
 * Company placeholders the wording uses that have nothing to say — a template
 * quoting {{company_email}} when no email is set would print "write to us at ."
 * into a contract. Generating refuses and names the field to fill in.
 */
export function missingCompanyFields(wording: string | null | undefined, company: AgreementCompany): string[] {
  const used = new Set([...(wording ?? "").matchAll(/\{\{(\w+)\}\}/g)].map((m) => m[1]));
  const vars = companyMergeVars(company);
  return COMPANY_MERGE_FIELDS.filter((f) => used.has(f.key) && !vars[f.key].trim()).map((f) => f.key.replace("company_", ""));
}

const LIMITS: Record<keyof Required<AgreementCompanyRow>, number> = {
  company_name: 120,
  office_address: 400,
  landline: 60,
  mobile: 60,
  email: 120,
  website: 120,
};

/**
 * The Company details form, read and checked the one way saving and
 * previewing both use. The address is one line on the agreement, so an
 * address typed over several lines is joined with commas rather than run
 * together.
 */
export function companyFromForm(
  get: (key: string) => unknown
): { row: { [K in keyof Required<AgreementCompanyRow>]: string | null }; error?: undefined } | { error: string } {
  const text = (key: keyof typeof LIMITS) => {
    const raw = String(get(key) ?? "");
    const joined = key === "office_address" ? raw.split(/[\r\n]+/).map((l) => l.trim()).filter(Boolean).join(", ") : raw;
    return joined.replace(/\s+/g, " ").trim();
  };
  const row = {
    company_name: text("company_name"),
    office_address: text("office_address"),
    landline: text("landline") || null,
    mobile: text("mobile") || null,
    email: text("email") || null,
    website: text("website") || null,
  };
  if (!row.company_name) return { error: "Fill in the company name — every agreement is made in its name." };
  if (!row.office_address) return { error: "Fill in the office address — every agreement opens with it." };
  for (const [key, limit] of Object.entries(LIMITS)) {
    if ((row[key as keyof typeof row] ?? "").length > limit) return { error: `The ${key.replace(/_/g, " ")} is longer than ${limit} characters.` };
  }
  if (row.email && !/^[^@\s]+@[^@\s]+$/.test(row.email)) return { error: "The email doesn't look like an email address." };
  return { row };
}
