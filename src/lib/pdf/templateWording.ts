import type { AgreementBlock } from "./agreementContent";

// Every super-admin-authored template's wording can reference these via
// {{fieldName}} — substituted per student at generation time. Keep this in
// sync with the `vars` object built in generateAgreementPdf (agreements.ts).
export const MERGE_FIELDS: { key: string; label: string }[] = [
  { key: "student_name", label: "Student's full name" },
  { key: "destination", label: "Destination display name (e.g. \"Germany (Public)\")" },
  { key: "admin_charge", label: "Administrative charge, formatted with currency (e.g. \"€450.00\")" },
  { key: "consultancy_fee", label: "Consultancy fee, formatted with currency" },
  { key: "discount", label: "Discount amount, formatted with currency (blank if none)" },
  { key: "total_fee", label: "Total professional fee (admin charge + consultancy fee - discount), formatted with currency" },
  { key: "currency", label: "Currency code (e.g. \"EUR\")" },
  { key: "agreement_date", label: "The date the agreement was generated" },
  { key: "signatory_name", label: "The template's fixed authorized signatory" },
];

export function renderMergeFields(text: string, vars: Record<string, string>): string {
  return text.replace(/\{\{(\w+)\}\}/g, (match, key: string) => (key in vars ? vars[key] : match));
}

// Converts a super-admin-authored wording blob (plain text, paragraphs
// separated by a blank line) into the same AgreementBlock[] shape the
// existing (legacy, hardcoded-per-country) content already renders through —
// so AgreementDocument needs no separate rendering path for template-driven
// wording. The itemized fee table always renders as its own fixed section
// straight after the narrative, regardless of what the wording says.
export function wordingToBlocks(wording: string, vars: Record<string, string>): AgreementBlock[] {
  const rendered = renderMergeFields(wording, vars);
  const paragraphs = rendered
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);
  return [...paragraphs.map((text): AgreementBlock => ({ kind: "paragraph", text })), { kind: "feeTable" }];
}

export const DEFAULT_OFFICE_LINE =
  "HMARK Consultants - Office Address: Suite 101, Dashtiyar Chambers, Opp. Urdu Federal University, Gulshan-e-Iqbal, Block 13-C, University Road, Karachi, Pakistan. Landline #: 021 34 999 777";
