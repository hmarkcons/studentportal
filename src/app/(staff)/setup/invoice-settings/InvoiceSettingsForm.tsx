"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import {
  updateInvoiceBankSettings,
  previewInvoiceSettings,
  regenerateInvoicePdfs,
  type InvoiceSettings,
} from "@/lib/actions/invoiceSettings";
import { DEFAULT_ISSUER } from "@/lib/invoiceIssuer";
import { Button } from "@/components/ui/Button";
import { Input, Textarea } from "@/components/ui/Input";
import { ActionStatus } from "@/components/ActionStatus";
import { DEFAULT_PKR_PER_EUR } from "@/lib/receiptPkr";

type TextKey = Exclude<keyof InvoiceSettings, "pkr_per_eur">;
type Field = { name: TextKey; label: string; placeholder?: string; hint?: string; required?: boolean; wide?: boolean; rows?: number };

// Each section is one part of the printed invoice, top to bottom.
const COMPANY: Field[] = [
  { name: "company_name", label: "Company name", required: true, placeholder: DEFAULT_ISSUER.companyName, wide: true },
  {
    name: "company_address",
    label: "Address",
    required: true,
    rows: 3,
    wide: true,
    hint: "Each line here is a line on the invoice.",
  },
  { name: "company_phone", label: "Phone", placeholder: "e.g. +92 21 3499 9777" },
  { name: "company_mobile", label: "Mobile", placeholder: "e.g. +92 334 3297870" },
  { name: "company_email", label: "Email", placeholder: "e.g. accounts@hmarkconsultants.com" },
  { name: "company_website", label: "Website", placeholder: "e.g. www.hmarkconsultants.com" },
];

const WORDING: Field[] = [
  { name: "invoice_title", label: "Title while money is owed", required: true, placeholder: "INVOICE" },
  { name: "receipt_title", label: "Title once paid in full", required: true, placeholder: "RECEIPT" },
  { name: "bill_to_label", label: "Label above the student’s name", required: true, placeholder: "BILL TO" },
  { name: "tax_label", label: "Tax name", required: true, placeholder: "SRB Tax", hint: "Prints as “SRB Tax (15% of …)” beside the tax." },
  { name: "payment_heading", label: "Payment instructions heading", required: true, placeholder: "PAYMENT INSTRUCTIONS" },
  { name: "schedule_heading", label: "Payment schedule heading", required: true, placeholder: "PAYMENT SCHEDULE" },
  {
    name: "admin_fee_note",
    label: "Line under each administrative fee",
    wide: true,
    hint: "Leave empty to print nothing there.",
  },
  {
    name: "footer_note",
    label: "Small print at the foot of the invoice",
    rows: 3,
    wide: true,
    hint: "One paragraph per line. Leave empty for none.",
  },
];

const BANK: Field[] = [
  { name: "account_title", label: "Account title", placeholder: "HMARK Consultants (Pvt.) Ltd." },
  { name: "bank_name", label: "Bank name", placeholder: "e.g. Meezan Bank" },
  { name: "branch", label: "Branch", placeholder: "e.g. Shahrah-e-Faisal" },
  { name: "account_number", label: "Account number", placeholder: "e.g. 0123456789" },
  { name: "iban", label: "IBAN", placeholder: "PK.. .... .... .... ....", wide: true },
  { name: "swift_code", label: "SWIFT / BIC", placeholder: "e.g. HABBPKKA" },
  {
    name: "payment_note",
    label: "Note under the bank details",
    placeholder: "e.g. Email proof of payment to accounts@…",
    wide: true,
    hint: "Prints on its own too — say, “Pay in cash at the office” with no account above it.",
  },
];

function Section({ title, intro, fields, settings, canEdit }: { title: string; intro: string; fields: Field[]; settings: InvoiceSettings | null; canEdit: boolean }) {
  return (
    <fieldset className="grid grid-cols-1 gap-3 border-t border-border pt-4 first:border-t-0 first:pt-0 sm:col-span-2 sm:grid-cols-2">
      <legend className="float-left mb-1 w-full sm:col-span-2">
        <span className="block text-sm font-semibold text-ink">{title}</span>
        <span className="block text-xs text-muted">{intro}</span>
      </legend>
      {fields.map((f) => {
        const common = {
          name: f.name,
          defaultValue: settings?.[f.name] ?? "",
          placeholder: f.placeholder,
          disabled: !canEdit,
          required: f.required,
          maxLength: f.rows ? 1500 : 300,
        };
        return (
          <label key={f.name} className={`flex flex-col gap-1 text-xs text-muted ${f.wide ? "sm:col-span-2" : ""}`}>
            <span>
              {f.label}
              {f.required && canEdit && <span className="text-danger"> *</span>}
            </span>
            {f.rows ? <Textarea rows={f.rows} {...common} /> : <Input {...common} />}
            {f.hint && <span className="text-[11px] text-muted">{f.hint}</span>}
          </label>
        );
      })}
    </fieldset>
  );
}

export function InvoiceSettingsForm({ settings, canEdit, pdfCount }: { settings: InvoiceSettings | null; canEdit: boolean; pdfCount: number }) {
  // Whether the form holds changes the saved settings do not — the PDFs are
  // rebuilt from what is saved, so regenerating before saving would quietly
  // print the old details again.
  const [dirty, setDirty] = useState(false);
  const [savedSinceRebuild, setSavedSinceRebuild] = useState(false);
  const [state, formAction, pending] = useActionState(async (prev: unknown, formData: FormData) => {
    const result = await updateInvoiceBankSettings(prev, formData);
    if ("success" in result) {
      setDirty(false);
      setSavedSinceRebuild(true);
    }
    return result;
  }, undefined);
  const form = useRef<HTMLFormElement>(null);

  const [previewing, setPreviewing] = useState<"invoice" | "receipt" | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  // Let go of the last preview's PDF when another replaces it or the page goes.
  useEffect(() => () => void (previewUrl && URL.revokeObjectURL(previewUrl)), [previewUrl]);
  useEffect(() => {
    if (!previewUrl) return;
    const close = (e: KeyboardEvent) => e.key === "Escape" && setPreviewUrl(null);
    document.addEventListener("keydown", close);
    return () => document.removeEventListener("keydown", close);
  }, [previewUrl]);

  async function preview(as: "invoice" | "receipt") {
    if (!form.current) return;
    setPreviewing(as);
    setPreviewError(null);
    try {
      const result = await previewInvoiceSettings(new FormData(form.current), as);
      if (result.error !== undefined) {
        setPreviewError(result.error);
        return;
      }
      const bytes = Uint8Array.from(atob(result.pdf), (c) => c.charCodeAt(0));
      setPreviewUrl(URL.createObjectURL(new Blob([bytes], { type: "application/pdf" })));
    } catch {
      setPreviewError("The preview could not be made. Try again in a moment.");
    } finally {
      setPreviewing(null);
    }
  }

  return (
    <>
      <form ref={form} action={formAction} onChange={() => setDirty(true)} className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        <Section
          title="Company details"
          intro="The top right of every invoice and receipt, under the title. The logo stays as it is."
          fields={COMPANY}
          settings={settings}
          canEdit={canEdit}
        />
        <Section
          title="Wording on the invoice"
          intro="The titles, labels and headings around the figures, and the small print."
          fields={WORDING}
          settings={settings}
          canEdit={canEdit}
        />
        <Section
          title="Bank details"
          intro="Where the student pays. Leave all of these empty and the invoice says nothing about a bank at all."
          fields={BANK}
          settings={settings}
          canEdit={canEdit}
        />

        <fieldset className="flex flex-col gap-1 border-t border-border pt-4 sm:col-span-2">
          <legend className="float-left mb-1 w-full text-sm font-semibold text-ink">Rupees per euro</legend>
          <Input
            name="pkr_per_eur"
            type="number"
            step="any"
            min="0.01"
            required
            aria-label="Rupees per euro"
            defaultValue={settings?.pkr_per_eur ?? DEFAULT_PKR_PER_EUR}
            disabled={!canEdit}
            className="sm:max-w-[12rem]"
          />
          <span className="text-[11px] text-muted">
            Shown beside every euro total on a receipt. Each receipt keeps the rate it was issued at, so changing this
            never restates one already in a student&rsquo;s hands.
          </span>
        </fieldset>

        {canEdit ? (
          <div className="flex flex-col gap-2 border-t border-border pt-4 sm:col-span-2">
            {state && "error" in state && <p className="text-xs text-danger">{state.error}</p>}
            {previewError && <p className="text-xs text-danger">{previewError}</p>}
            <div className="flex flex-wrap items-center gap-2">
              <Button type="submit" variant="primary" pending={pending}>
                Save invoice settings
              </Button>
              <Button type="button" onClick={() => preview("invoice")} disabled={previewing !== null}>
                {previewing === "invoice" ? "Making the PDF…" : "Preview invoice"}
              </Button>
              <Button type="button" onClick={() => preview("receipt")} disabled={previewing !== null}>
                {previewing === "receipt" ? "Making the PDF…" : "Preview receipt"}
              </Button>
              <ActionStatus state={state} pending={pending} />
            </div>
            <p className="text-[11px] text-muted">The previews print what is in the form now, saved or not, on a sample student.</p>
          </div>
        ) : (
          <p className="text-xs text-muted sm:col-span-2">Only the Super Admin and the accounts team can change what invoices say.</p>
        )}
      </form>

      {canEdit && <RegeneratePdfs pdfCount={pdfCount} dirty={dirty} highlight={savedSinceRebuild} onDone={() => setSavedSinceRebuild(false)} />}

      {previewUrl && (
        <div className="fixed inset-0 z-50 flex flex-col bg-black/60 p-4" role="dialog" aria-modal="true" aria-label="Preview of the invoice PDF">
          <div className="mx-auto flex w-full max-w-5xl items-center justify-between gap-2 rounded-t-md bg-card px-3 py-2">
            <p className="text-sm font-medium text-ink">Preview — a sample student; nothing is saved</p>
            <div className="flex items-center gap-2">
              <a href={previewUrl} download="invoice-preview.pdf" className="rounded-md border border-border px-3 py-1 text-sm text-ink hover:bg-bg">
                Download
              </a>
              <button
                type="button"
                onClick={() => setPreviewUrl(null)}
                className="rounded-md bg-primary px-3 py-1 text-sm font-medium text-primary-ink"
                autoFocus
              >
                Close
              </button>
            </div>
          </div>
          <iframe title="Invoice preview" src={previewUrl} className="mx-auto h-full w-full max-w-5xl rounded-b-md bg-white" />
        </div>
      )}
    </>
  );
}

/**
 * Rebuilds every invoice PDF on file from the saved settings, a batch per
 * request so it shows progress and no request runs long. A PDF made before a
 * change keeps the old details until then — including the bank block and the
 * currency note that no longer print.
 */
function RegeneratePdfs({ pdfCount, dirty, highlight, onDone }: { pdfCount: number; dirty: boolean; highlight: boolean; onDone: () => void }) {
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [failed, setFailed] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [finished, setFinished] = useState<number | null>(null);

  async function run() {
    setRunning(true);
    setError(null);
    setFailed([]);
    setFinished(null);
    setProgress({ done: 0, total: pdfCount });
    const problems: string[] = [];
    try {
      let next: number | null = 0;
      let total = pdfCount;
      while (next !== null) {
        const result = await regenerateInvoicePdfs(next);
        if ("error" in result) {
          setError(result.error);
          return;
        }
        problems.push(...result.failed);
        total = result.total;
        setProgress({ done: result.done, total });
        next = result.next;
      }
      setFailed(problems);
      setFinished(total - problems.length);
      if (!problems.length) onDone();
    } catch {
      setError("The rebuild stopped part-way. Run it again — it starts from the beginning and is safe to repeat.");
    } finally {
      setRunning(false);
    }
  }

  return (
    <div
      data-regenerate-invoices
      className={`mt-5 flex flex-col gap-2 rounded-md border p-3 ${highlight && pdfCount > 0 ? "border-warning bg-warning-bg" : "border-border"}`}
    >
      <div>
        <p className="text-sm font-semibold text-ink">Invoice PDFs already made</p>
        <p className="text-xs text-muted">
          {pdfCount === 0
            ? "No invoice has a PDF on file yet, so there is nothing to rebuild — every new one uses the settings above."
            : `${pdfCount} invoice${pdfCount === 1 ? " has" : "s have"} a PDF on file, made with the details as they were then. Rebuild them to print the saved settings above. Each keeps its own figures, dates and rupee rate.`}
        </p>
        {highlight && pdfCount > 0 && !running && finished === null && (
          <p className="mt-1 text-xs font-medium text-warning">Saved — the PDFs on file still show the old details until they are rebuilt.</p>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" onClick={run} pending={running} disabled={running || dirty || pdfCount === 0}>
          Regenerate all invoice PDFs
        </Button>
        {dirty && <span className="text-xs text-muted">Save your changes first — the PDFs are rebuilt from what is saved.</span>}
        {running && progress && (
          <span className="text-xs text-muted" aria-live="polite">
            Rebuilt {progress.done} of {progress.total}…
          </span>
        )}
        {finished !== null && !running && (
          <span className="text-xs text-success" aria-live="polite">
            Rebuilt {finished} PDF{finished === 1 ? "" : "s"}.
          </span>
        )}
      </div>
      {error && <p className="text-xs text-danger">{error}</p>}
      {failed.length > 0 && (
        <div className="text-xs text-danger">
          <p>{failed.length} could not be rebuilt and still show the old details:</p>
          <ul className="ml-4 list-disc">
            {failed.map((f) => (
              <li key={f}>{f}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
