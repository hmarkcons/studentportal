"use server";

import { createElement } from "react";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { hasRole } from "@/lib/auth/roles";
import { ISSUER_COLUMNS, issuerFromSettings, type IssuerRow } from "@/lib/invoiceIssuer";
import { computeInvoiceMath } from "@/lib/invoiceMath";
import { buildAndStoreInvoicePdf } from "@/lib/actions/invoices";

export type InvoiceBankSettings = {
  bank_name: string | null;
  account_title: string | null;
  account_number: string | null;
  iban: string | null;
  branch: string | null;
  swift_code: string | null;
  payment_note: string | null;
  /** Rupees per euro, stamped onto each invoice as it is issued. */
  pkr_per_eur: number | null;
};

/** Everything written on an invoice that is not the student's figures (0286). */
export type InvoiceSettings = InvoiceBankSettings & {
  company_name: string;
  company_address: string;
  company_phone: string | null;
  company_mobile: string | null;
  company_email: string | null;
  company_website: string | null;
  invoice_title: string;
  receipt_title: string;
  bill_to_label: string;
  admin_fee_note: string | null;
  tax_label: string;
  payment_heading: string;
  schedule_heading: string;
  footer_note: string | null;
};

const BANK_COLUMNS = "bank_name, account_title, account_number, iban, branch, swift_code, payment_note, pkr_per_eur";

/** Read the singleton settings row. Any active staff member may read it — it is
 *  printed on invoices they issue. Returns null when the row is unreachable so
 *  callers render "not configured" rather than a half-filled bank block. */
export async function getInvoiceBankSettings(): Promise<InvoiceSettings | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("invoice_settings")
    .select(`${BANK_COLUMNS}, ${ISSUER_COLUMNS}`)
    .eq("id", true)
    .maybeSingle<InvoiceSettings>();
  return data ?? null;
}

/** Who keeps the invoice's details: the Super Admin and the accounts team (0286). */
async function canEditInvoiceSettings(supabase: Awaited<ReturnType<typeof createClient>>) {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: me } = await supabase.from("staff").select("role, roles").eq("id", user?.id ?? "").maybeSingle();
  return hasRole(me, "super_admin", "finance");
}

// A blank one of these leaves its line off the invoice.
const OPTIONAL = [
  "bank_name", "account_title", "account_number", "iban", "branch", "swift_code", "payment_note",
  "company_phone", "company_mobile", "company_email", "company_website", "admin_fee_note", "footer_note",
] as const;

// Every invoice needs these; the database refuses them blank too (0286).
const REQUIRED: { key: keyof InvoiceSettings; label: string }[] = [
  { key: "company_name", label: "the company name" },
  { key: "company_address", label: "the address" },
  { key: "invoice_title", label: "the invoice title" },
  { key: "receipt_title", label: "the receipt title" },
  { key: "bill_to_label", label: "the “Bill to” label" },
  { key: "tax_label", label: "the tax name" },
  { key: "payment_heading", label: "the payment instructions heading" },
  { key: "schedule_heading", label: "the payment schedule heading" },
];

// Line breaks survive in the two multi-line texts; everywhere else runs of
// whitespace collapse, so a pasted value cannot carry a stray newline.
const MULTILINE = new Set(["company_address", "footer_note"]);
function text(formData: FormData, key: string): string {
  const raw = String(formData.get(key) ?? "");
  return MULTILINE.has(key)
    ? raw.split(/\r?\n/).map((l) => l.replace(/\s+/g, " ").trim()).filter(Boolean).join("\n")
    : raw.replace(/\s+/g, " ").trim();
}

/** A rate has to be a positive number: a zero or a blank would silently strip
 *  the rupee figures off every receipt issued afterwards. */
function parseRate(raw: FormDataEntryValue | null): number | null {
  const n = Number(String(raw ?? "").trim());
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : null;
}

type SettingsPatch = Record<string, string | number | null>;

/** The form, read and checked the one way both saving and previewing use. */
function settingsFromForm(formData: FormData): { patch: SettingsPatch; error?: undefined } | { error: string } {
  // The form says the same; this is for a request that did not come from it.
  // Past these a line runs off the page rather than wrapping inside its box.
  for (const key of [...OPTIONAL, ...REQUIRED.map((r) => r.key)]) {
    if (text(formData, key).length > (MULTILINE.has(key) ? 1500 : 300)) return { error: "One of the fields is too long to fit on an invoice." };
  }
  const patch: SettingsPatch = {};
  for (const key of OPTIONAL) patch[key] = text(formData, key) || null;
  for (const { key, label } of REQUIRED) {
    const value = text(formData, key);
    if (!value) return { error: `Fill in ${label} — every invoice prints it.` };
    patch[key] = value;
  }
  const rate = parseRate(formData.get("pkr_per_eur"));
  if (rate === null) return { error: "Give a rupees-per-euro rate greater than zero." };
  patch.pkr_per_eur = rate;
  return { patch };
}

export async function updateInvoiceBankSettings(_prevState: unknown, formData: FormData) {
  const supabase = await createClient();
  if (!(await canEditInvoiceSettings(supabase))) {
    return { error: "Only the Super Admin and the accounts team can change the invoice settings." };
  }

  const read = settingsFromForm(formData);
  if (read.error !== undefined) return { error: read.error };
  const patch = read.patch;

  // Selected back: an update the database refuses matches no rows and raises
  // nothing, which would read as "Saved" over a change that never happened.
  const { data: written, error } = await supabase.from("invoice_settings").update(patch).eq("id", true).select("id");
  if (error) return { error: error.message };
  if (!written?.length) return { error: "The settings weren't saved — only the Super Admin and the accounts team can change them." };

  revalidatePath("/setup/invoice-settings");
  revalidatePath("/finance/invoice-generator");
  return { success: true };
}

/**
 * Rebuilds invoice PDFs already on file with the current settings — a batch
 * at a time, so the page can show progress and no single request runs long.
 * Each invoice keeps its own figures and the rupee rate it was issued at; only
 * the wording around them and the bank block follow the settings.
 *
 * Runs on the service-role client once the role is checked, as the background
 * build does: a rebuild through the caller's own client could miss an invoice
 * RLS hides from them, or have its pdf_path write refused without a word, and
 * report a clean run over invoices it never touched.
 */
export async function regenerateInvoicePdfs(offset: number): Promise<{ error: string } | { done: number; total: number; next: number | null; failed: string[] }> {
  const supabase = await createClient();
  if (!(await canEditInvoiceSettings(supabase))) {
    return { error: "Only the Super Admin and the accounts team can regenerate invoice PDFs." };
  }
  const admin = createAdminClient();
  const BATCH = 8;
  const start = Math.max(0, Math.floor(offset) || 0);
  const { data: rows, count, error } = await admin
    .from("invoices")
    .select("id, student_id, invoice_number", { count: "exact" })
    .not("pdf_path", "is", null)
    .order("created_at", { ascending: true })
    .order("id", { ascending: true })
    .range(start, start + BATCH - 1);
  if (error) return { error: error.message };

  const failed: string[] = [];
  for (const row of rows ?? []) {
    const result = await buildAndStoreInvoicePdf(admin, row.id, row.student_id);
    if ("error" in result && result.error) failed.push(`${row.invoice_number ?? row.id}: ${result.error}`);
  }
  const total = count ?? 0;
  const done = Math.min(total, start + (rows ?? []).length);
  if (done >= total) revalidatePath("/finance/invoice-generator");
  return { done, total, next: done < total ? done : null, failed };
}

/**
 * The settings as they stand in the form — saved or not — printed on a sample
 * invoice by the same component that prints a real one, and handed back to be
 * shown in the page. Nothing is stored. "receipt" shows it paid in full, which
 * is when the receipt title prints instead of the invoice one.
 */
export async function previewInvoiceSettings(formData: FormData, as: "invoice" | "receipt"): Promise<{ pdf: string; error?: undefined } | { error: string; pdf?: undefined }> {
  const supabase = await createClient();
  if (!(await canEditInvoiceSettings(supabase))) {
    return { error: "Only the Super Admin and the accounts team can preview the invoice settings." };
  }
  const read = settingsFromForm(formData);
  if (read.error !== undefined) return { error: read.error };
  const s = read.patch;
  const str = (k: string) => (typeof s[k] === "string" ? (s[k] as string) : null);

  const math = computeInvoiceMath({ consultancyFee: 1500, adminCharge: 150, discountAmount: 0, taxRate: 15, taxBase: "services" });
  const first = 150 + 850;
  const paid = as === "receipt";
  const amountPaid = paid ? math.total : first;
  const today = new Date();
  const long = (d: Date) => d.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
  const short = (d: Date) => d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
  const later = new Date(today.getTime() + 60 * 86_400_000);

  const { renderToBuffer } = await import("@react-pdf/renderer");
  const { InvoiceDocument } = await import("@/lib/pdf/InvoiceDocument");
  const element = createElement(InvoiceDocument, {
    data: {
      invoiceNumber: `INV-${today.getFullYear()}-SAMPLE`,
      status: paid ? "paid" : "partially_paid",
      issuedDate: long(today),
      dueDate: null,
      currencySymbol: "€",
      currencyCode: "EUR",
      studentName: "Ayesha Khan (sample)",
      studentPhone: "0300-1234567",
      studentEmail: "ayesha.khan@example.com",
      destination: "Italy",
      intake: `Fall ${today.getFullYear() + 1}`,
      installmentPlan: "2 installments",
      adminCharge: math.adminCharge,
      adminCharges: [{ label: "Italy", amount: math.adminCharge, isBackup: false }],
      consultancyFee: math.consultancyFee,
      discountAmount: 0,
      discountReason: null,
      netConsultancyFee: math.netConsultancyFee,
      lineItems: [],
      extrasAmount: 0,
      taxableAmount: math.taxableAmount,
      taxRate: math.taxRate,
      taxAmount: math.taxAmount,
      terms: null,
      payments: [
        { date: short(today), method: "Bank transfer", amount: first, status: "paid", note: "incl. admin fee" },
        { date: paid ? short(today) : short(later), method: paid ? "Bank transfer" : null, amount: math.total - first, status: paid ? "paid" : "unpaid" },
      ],
      subtotal: math.total,
      amountPaid,
      balanceDue: Math.round((math.total - amountPaid) * 100) / 100,
      bank: {
        bankName: str("bank_name"),
        accountTitle: str("account_title"),
        accountNumber: str("account_number"),
        iban: str("iban"),
        branch: str("branch"),
        swiftCode: str("swift_code"),
        paymentNote: str("payment_note"),
      },
      issuer: issuerFromSettings(s as IssuerRow),
      pkrPerEur: typeof s.pkr_per_eur === "number" ? s.pkr_per_eur : null,
    },
  });
  const buffer = await renderToBuffer(element as Parameters<typeof renderToBuffer>[0]);
  return { pdf: Buffer.from(buffer).toString("base64") };
}
