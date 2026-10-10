// A registered student's status report: everything on their record, each item
// done, in progress, to do, sent back or not needed, by section.
//
// Staff download it from the student's Dashboard as a PDF
// (src/app/(staff)/students/[id]/report/route.ts). This module decides what
// each item's status is; studentReportLoad.ts reads the record and
// pdf/StudentReportDocument.tsx draws it. The statuses are read with the same
// helpers the student's own pages use — the stage tones of the country bar,
// an application's stage group, an invoice's payment progress — so the report
// cannot call something done that a tab calls outstanding.
//
// Pure, so it is unit-tested (scripts/student-report-test.mjs). Relative
// imports with their extensions: the tests load it under plain Node.

import { stageGroup, stageLabel, stageProgress } from "./applicationTable.ts";
import { categorizeApplicationStage } from "./applicationStage.ts";
import type { DestinationStatusRow } from "./destinationStatus.ts";
import { interviewStatusLabel } from "./interviews.ts";
import { computeInvoiceMath, computePaymentProgress, sumLineItems, type TaxBase } from "./invoiceMath.ts";
import { passportStatus, profileChecklist, PROFILE_GROUP_LABELS, type ProfileInput } from "./profileCompleteness.ts";
import { qualificationChecklist, type QualificationType } from "./qualifications.ts";
import { SCHOLARSHIP_DOCUMENT_STATUS_LABELS, scholarshipStatusLabel, type ScholarshipDocumentStatus } from "./scholarships.ts";
import { trackerValueFilled, parseMultiValue } from "./trackerValue.ts";
import type { VisaDecision } from "./visaOutcome.ts";

// ------------------------------------------------------------------ the model

/** Where an item stands. "blocked" is anything sent back, refused, rejected or overdue. */
export type ReportStatus = "done" | "progress" | "todo" | "blocked" | "na";

export const REPORT_STATUSES: readonly ReportStatus[] = ["done", "progress", "todo", "blocked", "na"];

export const STATUS_LABELS: Record<ReportStatus, string> = {
  done: "Done",
  progress: "In progress",
  todo: "To do",
  blocked: "Sent back / refused",
  na: "Not needed",
};

/** Green, amber, red, dark red and grey, as the office chose. */
export const STATUS_COLORS: Record<ReportStatus, string> = {
  done: "#16A34A",
  progress: "#D97706",
  todo: "#DC2626",
  blocked: "#7F1D1D",
  na: "#9CA3AF",
};

export type ReportItem = {
  label: string;
  status: ReportStatus;
  /** The word on its chip: "Approved", "Awaiting signature", "Overdue". */
  state: string;
  detail?: string | null;
  /** Who did the last thing to it, and when. */
  stamp?: string | null;
  /** When it falls due (YYYY-MM-DD), for "Coming up" and "Needs attention". */
  due?: string | null;
  /** What it is listed under within its section: a document section, a country, an invoice. */
  group?: string | null;
};

/** A table of plain facts beside the items — an invoice's figures, the people on the case. */
export type ReportFacts = {
  title: string;
  rows: { label: string; value: string; strong?: boolean }[];
  /** The group it is shown under, ahead of that group's items; none, ahead of everything. */
  group?: string | null;
};

export type SectionKey =
  | "registration"
  | "agreement"
  | "payments"
  | "documents"
  | "applications"
  | "journey"
  | "tracker"
  | "interviews"
  | "scholarship"
  | "visa"
  | "travel"
  | "tasks";

export type ReportSection = {
  key: SectionKey;
  title: string;
  items: ReportItem[];
  facts?: ReportFacts[];
  /** One line under the heading saying what the section covers, or why it is empty. */
  note?: string | null;
};

export type ReportRemark = { about: string; body: string; stamp: string | null };

/** A colour for every section, none of them a status colour, and no two neighbours alike. */
export const SECTION_COLORS: Record<SectionKey | "remarks", string> = {
  registration: "#0F766E",
  agreement: "#4338CA",
  payments: "#7E22CE",
  documents: "#0369A1",
  applications: "#BE185D",
  journey: "#9A3412",
  tracker: "#475569",
  interviews: "#1E3A8A",
  scholarship: "#854D0E",
  visa: "#0E7490",
  travel: "#A21CAF",
  tasks: "#3F3F46",
  remarks: "#57534E",
};

export const SECTION_TITLES: Record<SectionKey, string> = {
  registration: "Registration & profile",
  agreement: "Agreement",
  payments: "Invoice & payments",
  documents: "Documents",
  applications: "Applications",
  journey: "Country journey",
  tracker: "Documentation tracker",
  interviews: "Interviews & tests",
  scholarship: "Scholarship",
  visa: "Visa",
  travel: "Travel & arrival",
  tasks: "Tasks & follow-ups",
};

// ------------------------------------------------------------------ helpers

const LONG: Intl.DateTimeFormatOptions = { day: "numeric", month: "short", year: "numeric" };

/** "3 Oct 2026" for a date column. */
export function day(value: string | null | undefined): string | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}/.test(value)) return null;
  const [y, m, d] = value.slice(0, 10).split("-").map(Number);
  // Pinned to UTC: a date column is a calendar day, not a moment.
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-GB", { timeZone: "UTC", ...LONG });
}

/** "3 Oct 2026" for a moment, on Karachi's calendar. */
export function dayOf(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return null;
  return at.toLocaleDateString("en-GB", { timeZone: "Asia/Karachi", ...LONG });
}

/** The Karachi date of a moment, as YYYY-MM-DD. */
export function karachiDate(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const at = new Date(iso);
  return Number.isNaN(at.getTime()) ? null : at.toLocaleDateString("en-CA", { timeZone: "Asia/Karachi" });
}

/** "Approved 3 Oct 2026 by Sara Khan" — whichever parts are known. */
export function stampOf(verb: string, when: string | null | undefined, who?: string | null): string | null {
  if (!when && !who) return null;
  return [verb, when, who ? `by ${who}` : null].filter(Boolean).join(" ");
}

/** EUR 1,500.00 */
export function money(currency: string | null | undefined, amount: number): string {
  const n = Number.isFinite(amount) ? amount : 0;
  return `${(currency || "").trim() || "EUR"} ${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

const num = (v: number | string | null | undefined) => {
  const n = typeof v === "string" ? Number(v) : (v ?? 0);
  return Number.isFinite(n) ? n : 0;
};

const clean = (v: string | null | undefined) => (v ?? "").trim();

// The characters Helvetica can draw (WinAnsi): ASCII, Latin-1 and these.
const WIN_ANSI_EXTRA = new Set("€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ");
const SUBSTITUTES: Record<string, string> = { "→": "->", "←": "<-", "≥": ">=", "≤": "<=", "−": "-", "‐": "-", "‑": "-", "✓": "", "✔": "", "✗": "x", "×": "x", " ": " " };

/**
 * Text the PDF's standard font can draw. Anything else would print as a
 * blank or a wrong glyph, so a Turkish "ş" is written "s", an arrow "->",
 * and an emoji dropped — the record keeps the original; this is the print.
 */
export function pdfSafe(value: string | null | undefined): string {
  let out = "";
  for (const ch of String(value ?? "")) {
    const code = ch.codePointAt(0)!;
    if ((code >= 0x20 && code <= 0x7e) || (code >= 0xa0 && code <= 0xff) || WIN_ANSI_EXTRA.has(ch)) {
      out += ch;
      continue;
    }
    if (ch === "\n" || ch === "\t") {
      out += ch === "\n" ? "\n" : " ";
      continue;
    }
    if (ch in SUBSTITUTES) {
      out += SUBSTITUTES[ch];
      continue;
    }
    // A letter with an accent Latin-1 lacks: the letter alone.
    const bare = ch.normalize("NFKD").replace(/[̀-ͯ]/g, "");
    if (bare && [...bare].every((c) => c.codePointAt(0)! <= 0xff)) {
      out += bare;
      continue;
    }
    if (ch === "ı") out += "i";
    else if (ch === "ł") out += "l";
    else if (ch === "Ł") out += "L";
    else if (ch === "đ") out += "d";
  }
  return out;
}

// ------------------------------------------------------------------ registration

export type RegistrationInput = {
  registrationStatus: string | null;
  registeredAt: string | null;
  intake: string | null;
  studentCode: string | null;
  hasCountry: boolean;
  destinations: { name: string; isBackup: boolean }[];
  service: "full" | "visa_only";
  portal: { hasLogin: boolean; active: boolean };
  profile: ProfileInput;
  level: string | null;
  qualifications: QualificationType[];
  savedLogins: string[];
};

export function registrationSection(input: RegistrationInput): ReportSection {
  const items: ReportItem[] = [];
  const reg = clean(input.registrationStatus) || "registered";
  items.push(
    reg === "withdrawn"
      ? { label: "Registration", status: "blocked", state: "Withdrawn", stamp: stampOf("Registered", day(input.registeredAt) ?? dayOf(input.registeredAt)) }
      : reg === "ghost"
        ? { label: "Registration", status: "blocked", state: "Not responding", stamp: stampOf("Registered", day(input.registeredAt) ?? dayOf(input.registeredAt)) }
        : { label: "Registration", status: "done", state: "Registered", stamp: stampOf("Registered", day(input.registeredAt) ?? dayOf(input.registeredAt)) }
  );
  items.push(
    input.intake
      ? { label: "Intake", status: "done", state: "On file", detail: input.intake }
      : { label: "Intake", status: "todo", state: "Missing", detail: "No intake recorded — no Student ID, and the portal stays closed until one is." }
  );
  items.push(
    input.studentCode
      ? { label: "Student ID", status: "done", state: "Issued", detail: input.studentCode }
      : {
          label: "Student ID",
          status: "todo",
          state: "Not issued",
          detail: input.intake ? "Needs a country on file to be composed." : "Needs an intake to be composed.",
        }
  );
  const primary = input.destinations.find((d) => !d.isBackup);
  const backups = input.destinations.filter((d) => d.isBackup).map((d) => d.name);
  items.push(
    primary
      ? { label: "Destination", status: "done", state: "Chosen", detail: [primary.name, backups.length ? `backup: ${backups.join(", ")}` : null].filter(Boolean).join(" · ") }
      : input.destinations.length
        ? { label: "Destination", status: "done", state: "Chosen", detail: input.destinations.map((d) => d.name).join(", ") }
        : { label: "Destination", status: "todo", state: "Missing", detail: "No country chosen yet." }
  );
  items.push(
    input.portal.hasLogin && input.portal.active
      ? { label: "Student portal", status: "done", state: "Active", detail: "Login created and switched on." }
      : input.portal.hasLogin
        ? { label: "Student portal", status: "progress", state: "Switched off", detail: "A login exists but the portal is off." }
        : { label: "Student portal", status: "todo", state: "No login", detail: "No portal login created yet." }
  );

  for (const check of profileChecklist(input.profile)) {
    items.push({
      label: check.label,
      status: check.met ? "done" : "todo",
      state: check.met ? "On file" : "Missing",
      group: `Profile — ${PROFILE_GROUP_LABELS[check.group]}`,
    });
  }
  const passport = passportStatus(input.profile.passport_expiry);
  if (passport.state !== "missing") {
    const until = day(passport.expiry);
    items.push(
      passport.state === "ok"
        ? { label: "Passport validity", status: "done", state: "Valid", detail: `Valid until ${until}.`, group: `Profile — ${PROFILE_GROUP_LABELS.passport}` }
        : passport.state === "expiring"
          ? {
              label: "Passport validity",
              status: "progress",
              state: "Expiring soon",
              detail: `Expires ${until} — ${passport.daysLeft} days left; most visas need six months.`,
              due: passport.expiry,
              group: `Profile — ${PROFILE_GROUP_LABELS.passport}`,
            }
          : { label: "Passport validity", status: "blocked", state: "Expired", detail: `Expired ${until}. A new passport is needed.`, group: `Profile — ${PROFILE_GROUP_LABELS.passport}` }
    );
  }

  for (const q of qualificationChecklist(input.level, new Set(input.qualifications))) {
    items.push({ label: q.label, status: q.met ? "done" : "todo", state: q.met ? "On file" : "Missing", group: "Academic qualifications" });
  }

  const facts: ReportFacts[] = input.savedLogins.length
    ? [{ title: "Saved portal logins", rows: [{ label: "Logins on file", value: input.savedLogins.join(", ") }] }]
    : [];
  return { key: "registration", title: SECTION_TITLES.registration, items, facts };
}

// ------------------------------------------------------------------ agreement

export type AgreementInput = {
  id: string;
  country: string | null;
  version: number | null;
  status: string | null;
  signingMethod: string | null;
  agreementDate: string | null;
  createdAt: string | null;
  generatedBy: string | null;
  signedUploadedAt: string | null;
  videoUploadedAt: string | null;
  documentStatus: string | null;
  videoStatus: string | null;
  documentNote: string | null;
  videoNote: string | null;
  reviewedAt: string | null;
  reviewedBy: string | null;
  approvalUndoneAt: string | null;
};

/** The current agreement for each country: the highest version, else the newest. */
function currentAgreements(rows: readonly AgreementInput[]) {
  const byCountry = new Map<string, { current: AgreementInput; earlier: number }>();
  for (const a of rows) {
    const key = a.country ?? "—";
    const held = byCountry.get(key);
    const newer = (x: AgreementInput, y: AgreementInput) =>
      (x.version ?? 0) - (y.version ?? 0) || (x.createdAt ?? "").localeCompare(y.createdAt ?? "");
    if (!held) byCountry.set(key, { current: a, earlier: 0 });
    else if (newer(a, held.current) > 0) byCountry.set(key, { current: a, earlier: held.earlier + 1 });
    else held.earlier += 1;
  }
  return [...byCountry.values()];
}

export function agreementSection(rows: readonly AgreementInput[]): ReportSection {
  if (rows.length === 0) {
    return {
      key: "agreement",
      title: SECTION_TITLES.agreement,
      items: [{ label: "Student agreement", status: "todo", state: "Not generated", detail: "No agreement has been generated yet." }],
    };
  }
  const items: ReportItem[] = currentAgreements(rows).map(({ current: a, earlier }) => {
    const label = `Agreement — ${a.country ?? "no country"}${a.version ? ` (v${a.version})` : ""}`;
    const eSign = a.signingMethod === "e_signature";
    const how = eSign ? "e-signature" : a.signingMethod === "paper" ? "paper" : null;
    const before = earlier ? `${earlier} earlier version${earlier === 1 ? "" : "s"}` : null;
    const withBefore = (text: string) => [text, before].filter(Boolean).join(" · ");
    const parts = [how ? `Signed by ${how}` : null, a.agreementDate ? `dated ${day(a.agreementDate)}` : null, before];
    const generated = stampOf("Generated", dayOf(a.createdAt), a.generatedBy);
    if (a.status === "signed") {
      return {
        label,
        status: "done",
        state: "Signed",
        detail: parts.filter(Boolean).join(" · ") || null,
        stamp: stampOf(eSign ? "Approved" : "Signed copy filed", dayOf(a.reviewedAt ?? a.signedUploadedAt), a.reviewedBy) ?? generated,
      } satisfies ReportItem;
    }
    if (eSign && (a.documentStatus === "rejected" || a.videoStatus === "rejected")) {
      const what = [a.documentStatus === "rejected" ? "signed document" : null, a.videoStatus === "rejected" ? "consent video" : null].filter(Boolean).join(" and ");
      return {
        label,
        status: "blocked",
        state: "Sent back",
        detail: withBefore([`The ${what} was sent back.`, clean(a.documentNote) || clean(a.videoNote) || null].filter(Boolean).join(" ")),
        stamp: stampOf("Reviewed", dayOf(a.reviewedAt), a.reviewedBy) ?? generated,
      } satisfies ReportItem;
    }
    if (eSign && a.signedUploadedAt) {
      const waiting = [a.documentStatus !== "approved" ? "the signed document" : null, a.videoStatus !== "approved" ? (a.videoUploadedAt ? "the consent video" : "a consent video (not yet recorded)") : null].filter(Boolean);
      return {
        label,
        status: "progress",
        state: a.approvalUndoneAt ? "Re-verification" : "Awaiting verification",
        detail: withBefore(waiting.length ? `Signed in the portal; waiting on ${waiting.join(" and ")}.` : "Signed in the portal; waiting on approval."),
        stamp: stampOf("Signed", dayOf(a.signedUploadedAt)) ?? generated,
      } satisfies ReportItem;
    }
    return {
      label,
      status: "progress",
      state: "Awaiting signature",
      detail: withBefore(eSign ? "Waiting for the student to e-sign in the portal." : "Waiting for the signed paper copy."),
      stamp: generated,
    } satisfies ReportItem;
  });
  return { key: "agreement", title: SECTION_TITLES.agreement, items };
}

// ------------------------------------------------------------------ invoice & payments

export type InstallmentInput = {
  installmentNo: number;
  amount: number | string | null;
  amountPaid: number | string | null;
  status: string | null;
  dueDate: string | null;
  paidDate: string | null;
  paymentMethod: string | null;
  dueCondition: string | null;
};

export type InvoiceInput = {
  number: string | null;
  currency: string | null;
  issuedOn: string | null;
  createdAt: string | null;
  generatedBy: string | null;
  consultancyFee: number | string | null;
  adminCharge: number | string | null;
  adminCharges: { label: string; amount: number | string | null; isBackup: boolean }[];
  discountAmount: number | string | null;
  discountReason: string | null;
  taxRate: number | string | null;
  taxBase: string | null;
  feeName: string;
  lineItems: { name: string; amount: number | string | null }[];
  installments: InstallmentInput[];
  /** Each email that went out with it, newest first (0325). */
  emails: { sentTo: string | null; at: string | null; by: string | null; status: string | null }[];
};

export function paymentsSection(invoices: readonly InvoiceInput[], today: string): ReportSection {
  if (invoices.length === 0) {
    return {
      key: "payments",
      title: SECTION_TITLES.payments,
      items: [{ label: "Invoice", status: "todo", state: "Not raised", detail: "No invoice has been raised for this student." }],
    };
  }
  const items: ReportItem[] = [];
  const facts: ReportFacts[] = [];
  for (const inv of invoices) {
    const group = `Invoice ${inv.number ?? ""}`.trim();
    const cur = inv.currency ?? "EUR";
    const math = computeInvoiceMath({
      consultancyFee: num(inv.consultancyFee),
      adminCharge: num(inv.adminCharge),
      discountAmount: num(inv.discountAmount),
      // As the invoice card prices it: no stored rate is no tax, not today's rate.
      taxRate: num(inv.taxRate),
      // The rule it was raised under; one from before the column, the old rule (as InvoicePanel reads it).
      taxBase: (inv.taxBase === "total" ? "total" : "services") as TaxBase,
      extras: sumLineItems(inv.lineItems),
    });
    const schedule = [...inv.installments].sort((a, b) => a.installmentNo - b.installmentNo);
    const progress = computePaymentProgress(schedule.map((i) => ({ amount: i.amount, status: i.status, due_date: i.dueDate, amount_paid: i.amountPaid })));

    const rows: ReportFacts["rows"] = [{ label: inv.feeName, value: money(cur, math.consultancyFee) }];
    if (math.discountAmount > 0) {
      rows.push({ label: `Discount${clean(inv.discountReason) ? ` (${clean(inv.discountReason)})` : ""}`, value: `- ${money(cur, math.discountAmount)}` });
      rows.push({ label: `${inv.feeName} after discount`, value: money(cur, math.netConsultancyFee) });
    }
    const adminLines = inv.adminCharges.filter((c) => num(c.amount) > 0);
    if (adminLines.length) {
      for (const c of adminLines) rows.push({ label: `Administrative fee — ${c.label}${c.isBackup ? " (backup)" : ""}`, value: money(cur, num(c.amount)) });
    } else if (math.adminCharge > 0) {
      rows.push({ label: "Administrative fee", value: money(cur, math.adminCharge) });
    }
    for (const li of inv.lineItems) rows.push({ label: li.name, value: money(cur, num(li.amount)) });
    if (math.taxAmount > 0) rows.push({ label: `Tax (${math.taxRate}%)`, value: money(cur, math.taxAmount) });
    rows.push({ label: "Invoice total", value: money(cur, math.total), strong: true });
    rows.push({ label: "Paid", value: money(cur, progress.paid) });
    rows.push({ label: "Outstanding", value: money(cur, progress.outstanding), strong: true });
    if (progress.nextDueDate) rows.push({ label: "Next due", value: day(progress.nextDueDate) ?? progress.nextDueDate });
    facts.push({ title: `Figures (${cur})`, rows, group });

    items.push({
      label: "Invoice raised",
      status: "done",
      state: "Raised",
      detail: `${money(cur, math.total)} in ${schedule.length} instalment${schedule.length === 1 ? "" : "s"}.`,
      stamp: stampOf("Issued", day(inv.issuedOn) ?? dayOf(inv.createdAt), inv.generatedBy),
      group,
    });
    const sent = inv.emails.find((e) => e.status !== "failed");
    items.push(
      sent
        ? {
            label: "Invoice emailed",
            status: "done",
            state: "Sent",
            detail: `${inv.emails.filter((e) => e.status !== "failed").length} time${inv.emails.filter((e) => e.status !== "failed").length === 1 ? "" : "s"}, last to ${sent.sentTo ?? "the student"}.`,
            stamp: stampOf("Sent", dayOf(sent.at), sent.by),
            group,
          }
        : { label: "Invoice emailed", status: "todo", state: "Not sent", detail: "Not emailed to the student yet.", group }
    );
    if (schedule.length === 0) {
      items.push({ label: "Payment schedule", status: "todo", state: "No schedule", detail: "No instalments set.", group });
    }
    for (const i of schedule) {
      const label = `Instalment ${i.installmentNo}`;
      const amount = num(i.amount);
      const dueWords = i.dueDate ? `Due ${day(i.dueDate)}` : clean(i.dueCondition) ? `Due ${clean(i.dueCondition).replace(/^due\s+/i, "")}` : "No due date";
      if (i.status === "paid") {
        items.push({
          label,
          status: "done",
          state: "Paid",
          detail: [money(cur, amount), clean(i.paymentMethod) || null].filter(Boolean).join(" · "),
          stamp: stampOf("Paid", day(i.paidDate)),
          group,
        });
      } else if (i.status === "partial") {
        items.push({
          label,
          status: i.dueDate && i.dueDate < today ? "blocked" : "progress",
          state: i.dueDate && i.dueDate < today ? "Overdue (part paid)" : "Part paid",
          detail: `${money(cur, num(i.amountPaid))} of ${money(cur, amount)} paid · balance ${dueWords.toLowerCase()}`,
          stamp: stampOf("Last paid", day(i.paidDate)),
          due: i.dueDate,
          group,
        });
      } else if (i.dueDate && i.dueDate < today) {
        items.push({ label, status: "blocked", state: "Overdue", detail: `${money(cur, amount)} · was due ${day(i.dueDate)}`, due: i.dueDate, group });
      } else {
        items.push({ label, status: "todo", state: "Unpaid", detail: `${money(cur, amount)} · ${dueWords}`, due: i.dueDate, group });
      }
    }
  }
  return { key: "payments", title: SECTION_TITLES.payments, items, facts, note: invoices.length > 1 ? "Each invoice is shown in its own currency; the figures are never added across invoices." : null };
}

// ------------------------------------------------------------------ documents

export type DocumentInput = {
  name: string;
  section: string;
  status: string;
  files: number;
  uploadedAt: string | null;
  uploadedByRole: string | null;
  verifiedAt: string | null;
  verifiedBy: string | null;
  rejectedReason: string | null;
  deadline: string | null;
  carriedFrom: number | null;
};

const OPTIONAL = /\boptional\b/i;
const DOC_RANK: Record<ReportStatus, number> = { blocked: 0, todo: 1, progress: 2, done: 3, na: 4 };

export function documentsSection(docs: readonly DocumentInput[], sectionOrder: readonly string[], today: string): ReportSection {
  if (docs.length === 0) {
    return { key: "documents", title: SECTION_TITLES.documents, items: [], note: "No documents are required of this student yet." };
  }
  const rank = (s: string) => {
    const i = sectionOrder.indexOf(s);
    return i === -1 ? sectionOrder.length : i;
  };
  const items = docs.map((d): ReportItem => {
    // Said only when there is more than one: "1 file" on every row says nothing.
    const files = d.files > 1 ? `${d.files} files` : null;
    const from = d.carriedFrom ? `carried over from intake ${d.carriedFrom}` : null;
    const uploaded = stampOf(d.uploadedByRole === "student" ? "Uploaded by the student" : d.uploadedByRole === "partner" ? "Uploaded by the partner" : "Uploaded", dayOf(d.uploadedAt));
    switch (d.status) {
      case "verified":
        return { label: d.name, status: "done", state: "Approved", detail: [files, from].filter(Boolean).join(" · ") || null, stamp: stampOf("Approved", dayOf(d.verifiedAt), d.verifiedBy) ?? uploaded, group: d.section };
      case "submitted":
        return { label: d.name, status: "progress", state: "Submitted", detail: [files, "waiting for review"].filter(Boolean).join(" · "), stamp: uploaded, group: d.section };
      case "under_review":
        return { label: d.name, status: "progress", state: "Under review", detail: files, stamp: uploaded, group: d.section };
      case "rejected":
        return {
          label: d.name,
          status: "blocked",
          state: "Sent back",
          detail: clean(d.rejectedReason) ? `Reason: ${clean(d.rejectedReason)}` : "Sent back for a new copy.",
          stamp: stampOf("Sent back", dayOf(d.verifiedAt), d.verifiedBy) ?? uploaded,
          due: d.deadline,
          group: d.section,
        };
      default:
        // An optional item not sent is not something left to do.
        if (OPTIONAL.test(d.name)) return { label: d.name, status: "na", state: "Optional", detail: "Not sent; not required.", group: d.section };
        return {
          label: d.name,
          status: "todo",
          state: d.deadline && d.deadline < today ? "Missing — late" : "Missing",
          detail: d.deadline ? `${d.deadline < today ? "Was due" : "Due"} ${day(d.deadline)}` : null,
          due: d.deadline,
          group: d.section,
        };
    }
  });
  // Section by section in the checklist's order, and within each what needs
  // doing first: sent back, missing, waiting, approved, then the optional.
  const order = items.map((item, i) => ({ item, i }));
  order.sort((a, b) => rank(a.item.group ?? "") - rank(b.item.group ?? "") || (a.item.group ?? "").localeCompare(b.item.group ?? "") || DOC_RANK[a.item.status] - DOC_RANK[b.item.status] || a.i - b.i);
  return { key: "documents", title: SECTION_TITLES.documents, items: order.map((o) => o.item), note: "The current intake's checklist, section by section: what needs doing first." };
}

// ------------------------------------------------------------------ applications

export type ApplicationInput = {
  number: number;
  university: string;
  program: string | null;
  round: string | null;
  country: string | null;
  stage: string;
  pipeline: string[];
  deadline: string | null;
  finalized: boolean;
  finalizedBadge: string | null;
  tasksOpen: number;
  tasksTotal: number;
  stageSetAt: string | null;
  stageSetBy: string | null;
};

/** What an application's stage says about it. */
export function applicationStatus(stage: string, pipeline: readonly string[]): ReportStatus {
  const group = stageGroup(stage, pipeline);
  if (group === "accepted") return "done";
  if (group === "rejected") return "blocked";
  if (stage === "declined") return "blocked";
  if (group === "closed") return "na";
  if (categorizeApplicationStage(stage, [...pipeline]) === "submitted") return "progress";
  // Not yet submitted: under way once it is past the first step.
  return pipeline.indexOf(stage) > 0 ? "progress" : "todo";
}

export function applicationsSection(apps: readonly ApplicationInput[], visaOnly: boolean, today: string): ReportSection {
  if (apps.length === 0) {
    return {
      key: "applications",
      title: SECTION_TITLES.applications,
      items: [
        visaOnly
          ? { label: "University applications", status: "na", state: "Visa-only service", detail: "This student came for the visa service only." }
          : { label: "University applications", status: "todo", state: "None yet", detail: "No university applications have been made." },
      ],
    };
  }
  const items = [...apps]
    .sort((a, b) => a.number - b.number)
    .map((a): ReportItem => {
      const status = a.finalized ? "done" : applicationStatus(a.stage, a.pipeline);
      const step = stageProgress(a.stage, a.pipeline);
      const open = status === "todo" || status === "progress";
      const detail = [
        a.program,
        a.round ? `round: ${a.round}` : null,
        step ? `step ${step.step} of ${step.of}` : null,
        a.deadline ? `${open && a.deadline < today ? "deadline passed" : "deadline"} ${day(a.deadline)}` : null,
        a.tasksTotal ? `${a.tasksOpen} of ${a.tasksTotal} tasks open` : null,
      ].filter(Boolean);
      return {
        label: `#${a.number} ${a.university}`,
        status,
        state: a.finalized ? (a.finalizedBadge ?? "Finalized") : stageLabel(a.stage),
        detail: detail.join(" · ") || null,
        stamp: stampOf("Stage set", dayOf(a.stageSetAt), a.stageSetBy),
        due: open && a.deadline && a.deadline >= today ? a.deadline : null,
        group: a.country ?? "Applications",
      };
    });
  return { key: "applications", title: SECTION_TITLES.applications, items, note: "This intake's applications, in the priority order staff set." };
}

// ------------------------------------------------------------------ country journey

export function journeySection(rows: readonly DestinationStatusRow[]): ReportSection {
  const items: ReportItem[] = [];
  for (const row of rows) {
    const group = `${row.name}${row.role === "backup" ? " (backup)" : ""} — ${row.summary}`;
    for (const s of row.stages) {
      const shown = s.title ?? s.display;
      switch (s.state) {
        case "done":
          items.push({ label: s.label, status: "done", state: "Done", detail: shown, group });
          break;
        case "skipped":
          items.push({ label: s.label, status: "na", state: "Skipped", detail: shown, group });
          break;
        case "progress":
          items.push({ label: s.label, status: "progress", state: shown ?? "Under way", group });
          break;
        case "blocked":
          items.push({ label: s.label, status: "blocked", state: shown ?? "Stopped", group });
          break;
        case "next":
          items.push({ label: s.label, status: "todo", state: "Next", group });
          break;
        default:
          items.push({ label: s.label, status: "todo", state: "Not started", group });
      }
    }
  }
  return {
    key: "journey",
    title: SECTION_TITLES.journey,
    items,
    note: rows.length ? "Each country's steps, as kept on the Dashboard." : "No country has steps set up yet.",
  };
}

// ------------------------------------------------------------------ documentation tracker

export type TrackerFieldInput = {
  key: string;
  label: string;
  type: string;
  showWhen?: { key: string; equals: string };
};

export type TrackerCountryInput = {
  name: string;
  fields: TrackerFieldInput[];
  values: Record<string, string>;
  /** Application ids to university names: what a university picker stores. */
  names: Record<string, string>;
};

/** A field shown only once another holds a given answer, as the tracker form decides it. */
export function trackerFieldApplies(field: TrackerFieldInput, values: Record<string, string>): boolean {
  if (!field.showWhen) return true;
  const current = values[field.showWhen.key] ?? "";
  return field.showWhen.equals === "*" ? current.trim().length > 0 : current === field.showWhen.equals;
}

/** A stored tracker answer as words. */
export function trackerValueText(type: string, raw: string, names: Record<string, string>): string {
  const value = raw.trim();
  const named = (v: string) => names[v] ?? v;
  if (type === "boolean") return value === "true" ? "Yes" : value === "false" ? "No" : value;
  if (type === "date") return day(value) ?? value;
  if (type === "multi_university_status") {
    try {
      const rows = JSON.parse(value) as { university_id?: string; status?: string; date?: string }[];
      if (Array.isArray(rows)) {
        return rows
          .map((r) => [named(r.university_id ?? ""), r.status, r.date ? day(r.date) : null].filter(Boolean).join(": "))
          .join("; ");
      }
    } catch {
      return value;
    }
  }
  if (type === "multi_select" || type === "multi_text" || value.startsWith("[")) return parseMultiValue(value).map(named).join(", ");
  return named(value).replace(/_/g, " ");
}

export function trackerSection(countries: readonly TrackerCountryInput[]): ReportSection {
  const items: ReportItem[] = [];
  for (const c of countries) {
    for (const f of c.fields) {
      if (!trackerFieldApplies(f, c.values)) continue;
      const raw = c.values[f.key] ?? "";
      items.push(
        trackerValueFilled(raw)
          ? { label: f.label, status: "done", state: "Recorded", detail: trackerValueText(f.type, raw, c.names) || null, group: c.name }
          : { label: f.label, status: "todo", state: "Not recorded", group: c.name }
      );
    }
  }
  return {
    key: "tracker",
    title: SECTION_TITLES.tracker,
    items,
    note: countries.length
      ? "A field that applies only after another answer is left out until it applies."
      : "No country this student applies to has a documentation tracker.",
  };
}

// ------------------------------------------------------------------ interviews & tests

export type InterviewInput = {
  university: string;
  round: string | null;
  status: string | null;
  /** "Sat, Nov 28, 2026, 18:00", Karachi time. */
  when: string | null;
  /** The Karachi date it falls on. */
  date: string | null;
  platform: string | null;
  addedBy: string | null;
};

export type TestInput = {
  label: string;
  /** Ticked in a tracker. */
  ticked: boolean;
  /** Newest first. */
  scores: { score: string | null; date: string | null }[];
};

export function interviewsSection(interviews: readonly InterviewInput[], tests: readonly TestInput[], today: string): ReportSection {
  const items: ReportItem[] = [];
  for (const i of interviews) {
    const label = `Interview — ${i.university}${i.round ? ` (${i.round})` : ""}`;
    const detail = [i.when ? `${i.when} (Karachi)` : "Time not set", i.platform].filter(Boolean).join(" · ");
    const stamp = stampOf("Added", null, i.addedBy);
    const status = i.status ?? "scheduled";
    const upcoming = (status === "scheduled" || status === "rescheduled") && i.date !== null && i.date >= today;
    const base = { label, detail, stamp, group: "Interviews", due: upcoming ? i.date : null };
    if (status === "passed") items.push({ ...base, status: "done", state: "Passed" });
    else if (status === "failed") items.push({ ...base, status: "blocked", state: "Not successful" });
    else if (status === "cancelled") items.push({ ...base, status: "na", state: "Cancelled" });
    else if (status === "completed") items.push({ ...base, status: "progress", state: "Awaiting result" });
    else items.push({ ...base, status: "progress", state: upcoming ? interviewStatusLabel(status) : "Result to record" });
  }
  for (const t of tests) {
    const [latest, ...earlier] = t.scores;
    const before = earlier.length ? `earlier: ${earlier.map((s) => [s.score, s.date ? day(s.date) : null].filter(Boolean).join(" on ")).join("; ")}` : null;
    if (latest && clean(latest.score)) {
      items.push({
        label: t.label,
        status: "done",
        state: `Score ${clean(latest.score)}`,
        detail: [latest.date ? `taken ${day(latest.date)}` : null, before].filter(Boolean).join(" · ") || null,
        group: "Tests",
      });
    } else if (latest?.date && latest.date >= today) {
      items.push({ label: t.label, status: "progress", state: "Booked", detail: `on ${day(latest.date)}`, due: latest.date, group: "Tests" });
    } else {
      items.push({ label: t.label, status: "todo", state: "No score yet", detail: t.ticked ? "Ticked on the documentation tracker." : before, group: "Tests" });
    }
  }
  if (items.length === 0) {
    items.push({ label: "Interviews and tests", status: "na", state: "None", detail: "No interview is scheduled and no test is ticked or on file." });
  }
  return { key: "interviews", title: SECTION_TITLES.interviews, items };
}

// ------------------------------------------------------------------ scholarship

export type ScholarshipInput = {
  name: string;
  university: string | null;
  status: string;
  documentsStatus: string | null;
  awardAmount: number | string | null;
  deadline: string | null;
};

const GATE_WORDS: Record<string, { status: ReportStatus; state: string; detail: string }> = {
  no_application: { status: "na", state: "Not yet", detail: "A scholarship follows the university the student pre-enrols at; there are no applications yet." },
  no_body: { status: "na", state: "Not applicable", detail: "None of this student's countries has a scholarship body on file." },
  not_finalised: { status: "na", state: "Not yet", detail: "Opens once a university is finalised for pre-enrolment." },
  declined: { status: "na", state: "Not pursued", detail: "Answered “No” to applying for a scholarship on the documentation tracker." },
};

export function scholarshipSection(rows: readonly ScholarshipInput[], gateReason: string | null, today: string): ReportSection {
  const items: ReportItem[] = [];
  if (rows.length === 0) {
    const gate = gateReason ? GATE_WORDS[gateReason] : null;
    items.push(
      gate
        ? { label: "Scholarship", ...gate }
        : { label: "Scholarship application", status: "todo", state: "Not started", detail: "A university is finalised; no scholarship application is recorded yet." }
    );
    return { key: "scholarship", title: SECTION_TITLES.scholarship, items };
  }
  for (const s of rows) {
    const group = s.name + (s.university ? ` — ${s.university}` : "");
    const award = num(s.awardAmount) > 0 ? `award ${num(s.awardAmount).toLocaleString("en-US")}` : null;
    const deadline = s.deadline ? `deadline ${day(s.deadline)}` : null;
    const status: ReportStatus =
      s.status === "accepted" ? "done" : s.status === "rejected" || s.status === "modification" ? "blocked" : s.status === "submitted" ? "progress" : "todo";
    items.push({
      label: "Application",
      status,
      state: scholarshipStatusLabel(s.status),
      detail: [award, deadline].filter(Boolean).join(" · ") || null,
      due: status === "todo" && s.deadline && s.deadline >= today ? s.deadline : null,
      group,
    });
    const docs = (s.documentsStatus ?? "pending") as ScholarshipDocumentStatus;
    const docState = SCHOLARSHIP_DOCUMENT_STATUS_LABELS[docs] ?? docs;
    items.push({
      label: "Scholarship documents",
      status: docs === "submitted" || docs === "courier" ? "done" : docs === "not_required" ? "na" : "todo",
      state: docState,
      group,
    });
  }
  return { key: "scholarship", title: SECTION_TITLES.scholarship, items };
}

// ------------------------------------------------------------------ visa

export type VisaInput = {
  country: string;
  university: string | null;
  decision: VisaDecision;
  reason: string | null;
  appointments: { label: string; date: string | null }[];
};

export function visaSection(countries: readonly VisaInput[], today: string): ReportSection {
  if (countries.length === 0) {
    return {
      key: "visa",
      title: SECTION_TITLES.visa,
      items: [{ label: "Visa", status: "na", state: "Not yet", detail: "The visa process starts once a university is finalized." }],
    };
  }
  const items: ReportItem[] = [];
  for (const v of countries) {
    const group = `${v.country}${v.university ? ` — ${v.university}` : ""}`;
    items.push(
      v.decision === "approved"
        ? { label: "Visa decision", status: "done", state: "Approved", group }
        : v.decision === "refused"
          ? { label: "Visa decision", status: "blocked", state: "Refused", detail: clean(v.reason) ? `Reason: ${clean(v.reason)}` : null, group }
          : { label: "Visa decision", status: "progress", state: "In process", detail: "No decision recorded yet.", group }
    );
    for (const a of v.appointments) {
      if (!a.date) items.push({ label: a.label, status: v.decision === "pending" ? "todo" : "na", state: v.decision === "pending" ? "Not booked" : "Not needed", group });
      else if (a.date >= today) items.push({ label: a.label, status: "progress", state: "Booked", detail: day(a.date), due: a.date, group });
      else items.push({ label: a.label, status: "done", state: "Attended", detail: day(a.date), group });
    }
  }
  return { key: "visa", title: SECTION_TITLES.visa, items };
}

// ------------------------------------------------------------------ travel

export type TravelInput = { section: string; label: string; checked: boolean; checkedAt: string | null };

export function travelSection(items: readonly TravelInput[], visaApproved: boolean): ReportSection {
  if (!visaApproved) {
    return {
      key: "travel",
      title: SECTION_TITLES.travel,
      items: [{ label: "Travel checklist", status: "na", state: "Not yet", detail: "Opens to the student once a visa is approved." }],
    };
  }
  if (items.length === 0) {
    return { key: "travel", title: SECTION_TITLES.travel, items: [], note: "The country has no travel checklist set up." };
  }
  return {
    key: "travel",
    title: SECTION_TITLES.travel,
    items: items.map((t) =>
      t.checked
        ? { label: t.label, status: "done", state: "Ticked", stamp: stampOf("Ticked", dayOf(t.checkedAt)), group: t.section }
        : { label: t.label, status: "todo", state: "Not yet", group: t.section }
    ),
    note: "The checklist the student ticks off in their portal.",
  };
}

// ------------------------------------------------------------------ tasks & follow-ups

export type TaskInput = {
  kind: "application" | "follow_up" | "calendar";
  title: string;
  about: string | null;
  done: boolean;
  due: string | null;
  owner: string | null;
  priority: string | null;
};

const TASK_GROUPS: Record<TaskInput["kind"], string> = {
  application: "Application tasks",
  follow_up: "Follow-ups & reminders",
  calendar: "Calendar tasks",
};

export function tasksSection(tasks: readonly TaskInput[], today: string): ReportSection {
  const order: TaskInput["kind"][] = ["application", "follow_up", "calendar"];
  const items = [...tasks]
    .sort((a, b) => order.indexOf(a.kind) - order.indexOf(b.kind) || Number(a.done) - Number(b.done) || (a.due ?? "9999").localeCompare(b.due ?? "9999"))
    .map((t): ReportItem => {
      const detail = [t.about, t.priority && t.priority !== "medium" && t.priority !== "normal" ? `${t.priority} priority` : null].filter(Boolean).join(" · ") || null;
      const stamp = t.owner ? `For ${t.owner}` : null;
      const group = TASK_GROUPS[t.kind];
      if (t.done) return { label: t.title, status: "done", state: t.kind === "follow_up" ? "Resolved" : "Done", detail, stamp, group };
      if (t.due && t.due < today) return { label: t.title, status: "blocked", state: "Overdue", detail: [detail, `was due ${day(t.due)}`].filter(Boolean).join(" · "), stamp, due: t.due, group };
      return { label: t.title, status: "todo", state: t.due ? `Due ${day(t.due)}` : "Open", detail, stamp, due: t.due, group };
    });
  return {
    key: "tasks",
    title: SECTION_TITLES.tasks,
    items,
    note: items.length ? null : "No tasks, follow-ups or reminders are on record for this student.",
  };
}

// ------------------------------------------------------------------ the summary

export type StatusCounts = Record<ReportStatus, number>;

export function countStatuses(items: readonly { status: ReportStatus }[]): StatusCounts {
  const counts: StatusCounts = { done: 0, progress: 0, todo: 0, blocked: 0, na: 0 };
  for (const i of items) counts[i.status] += 1;
  return counts;
}

/** Done out of everything that is needed: a "not needed" item counts for nothing either way. */
export function percentDone(counts: StatusCounts): number {
  const needed = counts.done + counts.progress + counts.todo + counts.blocked;
  return needed === 0 ? 100 : Math.round((counts.done / needed) * 100);
}

export type SectionSummary = { key: SectionKey; title: string; color: string; counts: StatusCounts; needed: number; percent: number };

export type FlaggedItem = ReportItem & { section: string; color: string };

export type ReportSummary = {
  sections: SectionSummary[];
  overall: { counts: StatusCounts; needed: number; percent: number };
  /** Sent back, refused or overdue, then anything else past its date. */
  attention: FlaggedItem[];
  /** Not yet done and due within the next six weeks, soonest first. */
  upcoming: FlaggedItem[];
};

const addDays = (ymd: string, days: number) => {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
};

export function summariseReport(sections: readonly ReportSection[], today: string, limit = 8): ReportSummary {
  const summaries = sections.map((s): SectionSummary => {
    const counts = countStatuses(s.items);
    return { key: s.key, title: s.title, color: SECTION_COLORS[s.key], counts, needed: counts.done + counts.progress + counts.todo + counts.blocked, percent: percentDone(counts) };
  });
  const all = sections.flatMap((s) => s.items.map((i): FlaggedItem => ({ ...i, section: s.title, color: SECTION_COLORS[s.key] })));
  const counts = countStatuses(all);
  const open = (i: FlaggedItem) => i.status !== "done" && i.status !== "na";
  const attention = [
    ...all.filter((i) => i.status === "blocked"),
    ...all.filter((i) => open(i) && i.status !== "blocked" && i.due && i.due < today),
  ].slice(0, limit);
  const horizon = addDays(today, 42);
  const upcoming = all
    .filter((i) => open(i) && i.due && i.due >= today && i.due <= horizon)
    .sort((a, b) => (a.due ?? "").localeCompare(b.due ?? ""))
    .slice(0, limit);
  return {
    sections: summaries,
    overall: { counts, needed: counts.done + counts.progress + counts.todo + counts.blocked, percent: percentDone(counts) },
    attention,
    upcoming,
  };
}

/** The report's file name: HMC-Status-Report-Ayesha_Khan-HMC-FALL26-IT-0002-2026-10-10.pdf */
export function reportFileName(name: string | null | undefined, code: string | null | undefined, today: string): string {
  const slug = (v: string) =>
    pdfSafe(v)
      .normalize("NFKD")
      .replace(/[^\w\s-]+/g, "")
      .trim()
      .replace(/\s+/g, "_");
  return ["HMC-Status-Report", slug(name || "Student") || "Student", code ? slug(code) : null, today].filter(Boolean).join("-") + ".pdf";
}
