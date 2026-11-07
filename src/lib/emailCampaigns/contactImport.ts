// Importing contacts from a spreadsheet into the email audience: which column
// is which (guessed, then confirmed by the person importing), and each row read
// into a contact — its address checked, the same address once.
//
// No portal imports, so the unit tests load it under plain Node.

import { normalizeEmail } from "./audience.ts";

export const IMPORT_FIELDS = [
  { key: "email", label: "Email", required: true },
  { key: "full_name", label: "Full name" },
  { key: "first_name", label: "First name" },
  { key: "last_name", label: "Last name" },
  { key: "country", label: "Country of interest" },
  { key: "city", label: "City" },
  { key: "intake", label: "Intake" },
] as const;

export type ImportField = (typeof IMPORT_FIELDS)[number]["key"];
/** Which column (by index) each field is read from; absent for a field not in the file. */
export type ImportMapping = Partial<Record<ImportField, number>>;

const GUESS: Record<ImportField, RegExp> = {
  email: /^(e-?mail|email address|e-mail address|mail)$/i,
  full_name: /^(full ?name|name|student ?name|contact ?name)$/i,
  first_name: /^(first ?name|given ?name|fname)$/i,
  last_name: /^(last ?name|surname|family ?name|lname)$/i,
  country: /^(country|countries|country of interest|destination|preferred country)$/i,
  city: /^(city|town|location)$/i,
  intake: /^(intake|session|semester)$/i,
};

/** The columns a file's headers most likely are. */
export function guessMapping(headers: string[]): ImportMapping {
  const mapping: ImportMapping = {};
  headers.forEach((h, i) => {
    const clean = h.trim().replace(/[_*]+/g, " ").replace(/\s+/g, " ");
    for (const f of Object.keys(GUESS) as ImportField[]) {
      if (mapping[f] === undefined && GUESS[f].test(clean)) mapping[f] = i;
    }
  });
  // No header says "email": the first column whose values look like addresses is used by the caller instead.
  return mapping;
}

/** The first column most of whose sample values are addresses. */
export function guessEmailColumn(rows: string[][]): number | undefined {
  const width = Math.max(0, ...rows.map((r) => r.length));
  for (let i = 0; i < width; i++) {
    const values = rows.map((r) => r[i] ?? "").filter((v) => v.trim());
    if (values.length && values.filter((v) => normalizeEmail(v)).length / values.length >= 0.6) return i;
  }
  return undefined;
}

export type ImportRow = { email: string; fullName: string | null; country: string | null; city: string | null; intake: string | null };
export type ImportProblem = { line: number; value: string; reason: string };

const cell = (row: string[], i: number | undefined) => (i === undefined ? "" : (row[i] ?? "").trim());
const cap = (s: string, n: number) => (s ? s.slice(0, n) : null);

/**
 * The file's rows as contacts. A row without a usable address is listed with
 * its line (the header is line 1); the same address twice is kept once.
 */
export function readImportRows(rows: string[][], mapping: ImportMapping): { contacts: ImportRow[]; problems: ImportProblem[]; duplicates: number } {
  const contacts: ImportRow[] = [];
  const problems: ImportProblem[] = [];
  const seen = new Set<string>();
  let duplicates = 0;
  rows.forEach((row, i) => {
    const line = i + 2;
    if (row.every((v) => !v.trim())) return;
    const raw = cell(row, mapping.email);
    const email = normalizeEmail(raw);
    if (!email) {
      problems.push({ line, value: raw, reason: raw ? "not an email address" : "no email address" });
      return;
    }
    if (seen.has(email)) {
      duplicates += 1;
      return;
    }
    seen.add(email);
    const full = cell(row, mapping.full_name) || [cell(row, mapping.first_name), cell(row, mapping.last_name)].filter(Boolean).join(" ");
    contacts.push({
      email,
      fullName: cap(full, 200),
      country: cap(cell(row, mapping.country), 200),
      city: cap(cell(row, mapping.city), 120),
      intake: cap(cell(row, mapping.intake), 120),
    });
  });
  return { contacts, problems, duplicates };
}

/** Domains so common that asking their mail servers again is a waste of time. */
export const KNOWN_MAIL_DOMAINS = new Set([
  "gmail.com", "googlemail.com", "yahoo.com", "ymail.com", "hotmail.com", "outlook.com", "live.com", "msn.com",
  "icloud.com", "me.com", "aol.com", "protonmail.com", "proton.me", "hmarkconsultants.com",
]);
