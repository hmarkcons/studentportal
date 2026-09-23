"use client";

import { useActionState, useState } from "react";
import { generateAgreement, updateAgreement, uploadSignedAgreement, deleteAgreement } from "@/lib/actions/agreements";
import { Button } from "@/components/ui/Button";
import { useButtonAction } from "@/components/useButtonAction";
import { toast } from "@/lib/toast";
import { FileField } from "@/components/FileField";
import { Input, Select } from "@/components/ui/Input";

type AgreementTemplateOption = {
  id: string;
  name: string;
  signatory_name: string;
  destination: { id: string; display_name: string } | { id: string; display_name: string }[] | null;
};

function templateDest(d: AgreementTemplateOption["destination"]) {
  return Array.isArray(d) ? d[0] : d;
}

// A backup-country destination (per this student's lead_destinations —
// see students/[id]/page.tsx) only ever gets an administrative-fee-only
// agreement (no consultancy fee, see generateAgreement/generateAgreementPdf),
// so once staff picks such a template the consultancy/discount/installment
// fields would just be silently ignored server-side — hiding them here
// instead of letting staff fill in values that go nowhere.
export function GenerateAgreementForm({
  studentId,
  templates,
  discountAmount,
  backupDestinationIds = [],
  missingTemplateFor = [],
  hasCountry = true,
}: {
  studentId: string;
  /** Already narrowed to this student's own countries — see agreementTemplateChoices. */
  templates: AgreementTemplateOption[];
  discountAmount?: number | null;
  backupDestinationIds?: string[];
  /** Countries they are registered for that nobody has written a template for. */
  missingTemplateFor?: string[];
  /** False when their registration has no country at all. */
  hasCountry?: boolean;
}) {
  const action = generateAgreement.bind(null, studentId);
  const [state, formAction, pending] = useActionState(action, undefined);
  const [templateId, setTemplateId] = useState("");
  const isBackup = backupDestinationIds.includes(
    templateDest(templates.find((t) => t.id === templateId)?.destination ?? null)?.id ?? ""
  );

  // An empty dropdown with no explanation is the worst version of this. The
  // two reasons it can be empty need different people to do different things,
  // so they are said apart.
  if (!hasCountry) {
    return (
      <p className="rounded-md border border-warning bg-warning-bg px-3 py-2 text-xs text-warning">
        This student has no country on their registration yet, so there is no agreement to generate. Set their country
        in the <strong className="font-medium">Registration &amp; Portal Access</strong> card above.
      </p>
    );
  }
  if (templates.length === 0) {
    return (
      <p className="rounded-md border border-warning bg-warning-bg px-3 py-2 text-xs text-warning">
        No agreement template has been written for{" "}
        <strong className="font-medium">{missingTemplateFor.join(", ") || "their country"}</strong> yet. Add one in
        Setup › Agreement templates and it will appear here.
      </p>
    );
  }

  return (
    <form action={formAction} className="flex flex-wrap items-end gap-2">
      <Select name="template_id" required value={templateId} onChange={(e) => setTemplateId(e.target.value)}>
        <option value="">Template…</option>
        {templates.map((t) => (
          <option key={t.id} value={t.id}>
            {templateDest(t.destination)?.display_name} — {t.name}
            {backupDestinationIds.includes(templateDest(t.destination)?.id ?? "") ? " (Backup)" : ""}
          </option>
        ))}
      </Select>
      <Select name="signing_method" required>
        <option value="paper">Paper (Karachi)</option>
        <option value="e_signature">E-signature (outside Karachi)</option>
      </Select>
      <Input name="admin_charge_override" type="number" step="0.01" placeholder="Admin charge override" className="w-40" />
      {!isBackup && (
        <>
          <Input name="consultancy_fee_override" type="number" step="0.01" placeholder="Consultancy fee override" className="w-44" />
          <Input
            name="discount_amount"
            type="number"
            step="0.01"
            placeholder="Discount amount"
            defaultValue={discountAmount ?? ""}
            className="w-36"
          />
          <Select name="installment_count" defaultValue="1">
            <option value="1">1 consultancy fee installment</option>
            <option value="2">2 consultancy fee installments</option>
            <option value="3">3 consultancy fee installments</option>
          </Select>
        </>
      )}
      <Button type="submit" variant="primary" pending={pending} status={{ state, label: "Generated." }}>
        Generate agreement
      </Button>
      {isBackup && (
        <p className="w-full text-xs text-muted">Backup country — this agreement will show the administrative fee only, no consultancy fee.</p>
      )}
      {/* Some of their countries are covered and some are not, which reads as
          a missing option unless it is said. */}
      {missingTemplateFor.length > 0 && (
        <p className="w-full text-xs text-warning">
          No template exists yet for {missingTemplateFor.join(", ")} — add one in Setup › Agreement templates to
          generate that one.
        </p>
      )}
      {state?.error && <p className="text-xs text-danger">{state.error}</p>}
    </form>
  );
}

export function EditAgreementForm({
  agreement,
  studentId,
  templates,
  backupDestinationIds = [],
  onSuccess,
}: {
  agreement: {
    id: string;
    template_id: string | null;
    signing_method: string | null;
    admin_charge_override: number | null;
    consultancy_fee_override: number | null;
    discount_amount: number | null;
    installment_count: number | null;
  };
  studentId: string;
  templates: AgreementTemplateOption[];
  backupDestinationIds?: string[];
  onSuccess: () => void;
}) {
  const action = updateAgreement.bind(null, agreement.id, studentId);
  const [state, formAction, pending] = useActionState(action, undefined);
  const [templateId, setTemplateId] = useState(agreement.template_id ?? "");
  const isBackup = backupDestinationIds.includes(
    templateDest(templates.find((t) => t.id === templateId)?.destination ?? null)?.id ?? ""
  );

  return (
    <form action={formAction} className="flex w-full flex-col flex-wrap items-end gap-2">
      <Select name="template_id" value={templateId} onChange={(e) => setTemplateId(e.target.value)} required className="w-full">
        <option value="">Template…</option>
        {templates.map((t) => (
          <option key={t.id} value={t.id}>
            {templateDest(t.destination)?.display_name} — {t.name}
            {backupDestinationIds.includes(templateDest(t.destination)?.id ?? "") ? " (Backup)" : ""}
          </option>
        ))}
      </Select>
      <Select name="signing_method" defaultValue={agreement.signing_method ?? "paper"} required className="w-full">
        <option value="paper">Paper (Karachi)</option>
        <option value="e_signature">E-signature (outside Karachi)</option>
      </Select>
      <Input
        name="admin_charge_override"
        type="number"
        step="0.01"
        placeholder="Admin charge override"
        defaultValue={agreement.admin_charge_override ?? ""}
        className="w-full"
      />
      {isBackup && (
        <p className="w-full text-xs text-muted">Backup country — this agreement will show the administrative fee only, no consultancy fee.</p>
      )}
      {!isBackup && (
        <>
          <Input
            name="consultancy_fee_override"
            type="number"
            step="0.01"
            placeholder="Consultancy fee override"
            defaultValue={agreement.consultancy_fee_override ?? ""}
            className="w-full"
          />
          <Input
            name="discount_amount"
            type="number"
            step="0.01"
            placeholder="Discount amount"
            defaultValue={agreement.discount_amount ?? ""}
            className="w-full"
          />
          <Select name="installment_count" defaultValue={String(agreement.installment_count ?? 1)} className="w-full">
            <option value="1">1 consultancy fee installment</option>
            <option value="2">2 consultancy fee installments</option>
            <option value="3">3 consultancy fee installments</option>
          </Select>
        </>
      )}
      <div className="flex w-full items-center gap-2">
        <Button type="submit" variant="primary" size="sm" pending={pending} status={{ state, label: "Saved." }}>
          Save
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={onSuccess}>
          {state?.success ? "Close" : "Cancel"}
        </Button>
      </div>
      {state?.error && <p className="w-full text-xs text-danger">{state.error}</p>}
      <p className="w-full text-xs text-muted">
        Saving does not regenerate the PDF — use &quot;Regenerate PDF&quot; afterward to apply these changes to the document.
      </p>
    </form>
  );
}

export function DeleteAgreementButton({ agreementId, studentId }: { agreementId: string; studentId: string }) {
  // The agreement, and this button with it, goes when the delete works — so
  // it confirms with a toast, and a refusal is said under the button.
  const del = useButtonAction();

  async function handleDelete() {
    if (!confirm("Delete this agreement? This cannot be undone.")) return;
    await del.run(() => deleteAgreement(agreementId, studentId), { toast: "Deleted." });
  }

  return (
    <div>
      <button
        onClick={handleDelete}
        disabled={del.pending}
        aria-busy={del.pending || undefined}
        className="w-fit text-xs text-danger hover:underline disabled:opacity-50"
      >
        Delete
      </button>
      {del.state?.error && <p className="mt-1 text-xs text-danger">{del.state.error}</p>}
    </div>
  );
}

// `replace` is for a paper agreement that is already signed: uploading the
// wrong scan used to be uncorrectable, because the upload sets status=signed
// and every caller hid this form once it was. The only way out was deleting
// the agreement and regenerating it. Super Admin can now swap the file, and
// the action supersedes the old object rather than leaving it in the
// student's folder.
export function UploadSignedAgreementForm({
  agreementId,
  studentId,
  replace = false,
}: {
  agreementId: string;
  studentId: string;
  replace?: boolean;
}) {
  const upload = uploadSignedAgreement.bind(null, agreementId, studentId);
  // A first upload marks the agreement signed, and the page then shows the
  // review in place of this form — so that one confirms with a toast. A
  // replacement stays on screen and says "Uploaded." beside its button.
  const action = async (prevState: unknown, formData: FormData) => {
    const result = await upload(prevState, formData);
    if (!replace && !result?.error) toast("Uploaded.");
    return result;
  };
  const [state, formAction, pending] = useActionState(action, undefined);
  const [ready, setReady] = useState(false);

  return (
    <form action={formAction} className="mt-2 flex flex-col gap-2">
      {replace && <p className="text-xs text-muted">Replaces the signed copy on file. The previous scan is deleted.</p>}
      {/* File input sits directly next to the button it feeds. */}
      <div className="flex flex-wrap items-start gap-2">
        <FileField required noun="agreement" hint="Scan or photo of the signed copy" onChange={(s) => setReady(Boolean(s.file))} />
        <Button
          type="submit"
          variant="outline-primary"
          size="sm"
          pending={pending}
          disabled={!ready}
          status={{ state, label: "Uploaded." }}
        >
          {replace ? "Replace signed agreement" : "Upload signed agreement"}
        </Button>
      </div>
      <label className="flex items-center gap-1 text-xs text-muted">
        <input type="checkbox" name="email_verified" /> Email verified
      </label>
      {state?.error && <p className="text-xs text-danger">{state.error}</p>}
    </form>
  );
}
