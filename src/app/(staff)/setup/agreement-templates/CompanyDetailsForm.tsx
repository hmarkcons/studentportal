"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { updateAgreementCompany } from "@/lib/actions/agreementSettings";
import { previewAgreementCompany } from "@/lib/actions/agreementPreview";
import {
  COMPANY_MERGE_FIELDS,
  DEFAULT_AGREEMENT_COMPANY,
  companyFromSettings,
  officeLine,
  type AgreementCompanyRow,
} from "@/lib/agreementCompany";
import { Button } from "@/components/ui/Button";
import { Input, Textarea } from "@/components/ui/Input";
import { ActionStatus } from "@/components/ActionStatus";

type Values = { [K in keyof Required<AgreementCompanyRow>]: string };

const FIELDS: { name: keyof Values; label: string; required?: boolean; placeholder?: string; wide?: boolean; type?: string }[] = [
  { name: "company_name", label: "Company name", required: true, wide: true },
  { name: "office_address", label: "Office address", required: true, wide: true },
  { name: "landline", label: "Landline", placeholder: "e.g. 021 34 999 777" },
  { name: "mobile", label: "Mobile", placeholder: "e.g. 0334 3297870" },
  { name: "email", label: "Email", placeholder: "e.g. info@hmarkconsultants.com", type: "email" },
  { name: "website", label: "Website", placeholder: "e.g. www.hmarkconsultants.com" },
];

export function CompanyDetailsForm({ saved, canEdit }: { saved: AgreementCompanyRow | null; canEdit: boolean }) {
  const initial = companyFromSettings(saved);
  // Controlled, so the preview beside the form reads what is typed now.
  const [values, setValues] = useState<Values>({
    company_name: initial.companyName,
    office_address: initial.address,
    landline: initial.landline ?? "",
    mobile: initial.mobile ?? "",
    email: initial.email ?? "",
    website: initial.website ?? "",
  });
  const [state, formAction, pending] = useActionState(updateAgreementCompany, undefined);
  const form = useRef<HTMLFormElement>(null);

  const [previewing, setPreviewing] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  useEffect(() => () => void (previewUrl && URL.revokeObjectURL(previewUrl)), [previewUrl]);
  useEffect(() => {
    if (!previewUrl) return;
    const close = (e: KeyboardEvent) => e.key === "Escape" && setPreviewUrl(null);
    document.addEventListener("keydown", close);
    return () => document.removeEventListener("keydown", close);
  }, [previewUrl]);

  async function preview() {
    if (!form.current) return;
    setPreviewing(true);
    setPreviewError(null);
    try {
      const result = await previewAgreementCompany(new FormData(form.current));
      if (result.error !== undefined) {
        setPreviewError(result.error);
        return;
      }
      const bytes = Uint8Array.from(atob(result.pdf), (c) => c.charCodeAt(0));
      setPreviewUrl(URL.createObjectURL(new Blob([bytes], { type: "application/pdf" })));
    } catch {
      setPreviewError("The preview could not be made. Try again in a moment.");
    } finally {
      setPreviewing(false);
    }
  }

  // What the agreement will say, from the form as it stands. The same
  // functions the PDF uses, so this cannot disagree with it.
  const typed = companyFromSettings({
    company_name: values.company_name,
    office_address: values.office_address.split(/\n+/).map((l) => l.trim()).filter(Boolean).join(", "),
    landline: values.landline,
    mobile: values.mobile,
    email: values.email,
    website: values.website,
  });
  const changed = officeLine(typed) !== officeLine(initial) || typed.companyName !== initial.companyName;

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
      <form ref={form} action={formAction} className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:col-span-3">
        {FIELDS.map((f) => (
          <label key={f.name} className={`flex flex-col gap-1 text-xs text-muted ${f.wide ? "sm:col-span-2" : ""}`}>
            <span>
              {f.label}
              {f.required && canEdit && <span className="text-danger"> *</span>}
            </span>
            {f.name === "office_address" ? (
              <Textarea
                name={f.name}
                rows={2}
                value={values[f.name]}
                onChange={(e) => setValues((v) => ({ ...v, [f.name]: e.target.value }))}
                disabled={!canEdit}
                required
                maxLength={400}
              />
            ) : (
              <Input
                name={f.name}
                type={f.type ?? "text"}
                value={values[f.name]}
                onChange={(e) => setValues((v) => ({ ...v, [f.name]: e.target.value }))}
                placeholder={f.placeholder}
                disabled={!canEdit}
                required={f.required}
                maxLength={f.name === "company_name" || f.name === "email" || f.name === "website" ? 120 : 60}
              />
            )}
            {f.name === "office_address" && (
              <span className="text-[11px]">One line on the agreement — lines typed here are joined with commas.</span>
            )}
          </label>
        ))}

        {canEdit ? (
          <div className="flex flex-col gap-2 sm:col-span-2">
            {state && "error" in state && state.error && <p className="text-xs text-danger">{state.error}</p>}
            {previewError && <p className="text-xs text-danger">{previewError}</p>}
            <div className="flex flex-wrap items-center gap-2">
              <Button type="submit" variant="primary" pending={pending}>
                Save company details
              </Button>
              <Button type="button" onClick={preview} disabled={previewing}>
                {previewing ? "Making the PDF…" : "Preview on an agreement"}
              </Button>
              <ActionStatus state={state} pending={pending} />
            </div>
            <p className="text-[11px] text-muted">
              Every agreement generated or regenerated from now on prints these — student and staff, every template.
              Agreements already generated keep what they say.
            </p>
          </div>
        ) : (
          <p className="text-xs text-muted sm:col-span-2">Only a Super Admin can change the company details on agreements.</p>
        )}
      </form>

      <div className="flex flex-col gap-3 lg:col-span-2" data-company-preview>
        <div className="rounded-md border border-border bg-bg p-3">
          <p className="mb-2 text-[11px] font-medium uppercase tracking-wide text-muted">
            How it prints{changed && canEdit ? " — not saved yet" : ""}
          </p>
          <div className="mb-3 flex items-start justify-between gap-3 border-b border-border pb-2">
            <span className="text-[11px] text-muted">[logo]</span>
            <span className="text-right text-xs text-ink" data-preview-header>
              {typed.companyName}
              <br />
              Retainer Agreement
            </span>
          </div>
          <p className="text-xs leading-relaxed text-ink" data-preview-office-line>
            {officeLine(typed)}
          </p>
          <p className="mt-3 text-[11px] font-semibold text-ink" data-preview-signature>
            (Signature) {typed.companyName}
          </p>
        </div>
        <details className="text-xs text-muted">
          <summary className="cursor-pointer">Use these in a template&rsquo;s wording</summary>
          <p className="mt-1">
            Type them into any template, student or staff, or pick them from <strong>+ Insert field</strong>. They print what
            is saved here, so wording that mentions the address follows it too.
          </p>
          <ul className="mt-1 list-disc pl-5">
            {COMPANY_MERGE_FIELDS.map((f) => (
              <li key={f.key}>
                <code>{`{{${f.key}}}`}</code> — {f.label}
              </li>
            ))}
          </ul>
        </details>
        {!changed && officeLine(initial) === officeLine(DEFAULT_AGREEMENT_COMPANY) && (
          <p className="text-[11px] text-muted">These are the details agreements have always printed.</p>
        )}
      </div>

      {previewUrl && (
        <div className="fixed inset-0 z-50 flex flex-col bg-black/60 p-4" role="dialog" aria-modal="true" aria-label="Preview of an agreement">
          <div className="mx-auto flex w-full max-w-5xl items-center justify-between gap-2 rounded-t-md bg-card px-3 py-2">
            <p className="text-sm font-medium text-ink">Preview — a sample student on a Standard agreement; nothing is saved</p>
            <div className="flex items-center gap-2">
              <a href={previewUrl} download="agreement-preview.pdf" className="rounded-md border border-border px-3 py-1 text-sm text-ink hover:bg-bg">
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
          <iframe title="Agreement preview" src={previewUrl} className="mx-auto h-full w-full max-w-5xl rounded-b-md bg-white" />
        </div>
      )}
    </div>
  );
}
