"use client";

import { useActionState, useState } from "react";
import { generateAgreement, updateAgreement, uploadSignedAgreement, deleteAgreement } from "@/lib/actions/agreements";
import { Button } from "@/components/ui/Button";
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
}: {
  studentId: string;
  templates: AgreementTemplateOption[];
  discountAmount?: number | null;
  backupDestinationIds?: string[];
}) {
  const action = generateAgreement.bind(null, studentId);
  const [state, formAction, pending] = useActionState(action, undefined);
  const [templateId, setTemplateId] = useState("");
  const isBackup = backupDestinationIds.includes(
    templateDest(templates.find((t) => t.id === templateId)?.destination ?? null)?.id ?? ""
  );

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
      <Button type="submit" variant="primary" pending={pending}>
        Generate agreement
      </Button>
      {isBackup && (
        <p className="w-full text-xs text-muted">Backup country — this agreement will show the administrative fee only, no consultancy fee.</p>
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
        <Button type="submit" variant="primary" size="sm" pending={pending}>
          Save
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={onSuccess}>
          {state?.success ? "Close" : "Cancel"}
        </Button>
      </div>
      {state?.error && <p className="w-full text-xs text-danger">{state.error}</p>}
      {state?.success && <p className="w-full text-xs text-success">Saved.</p>}
      <p className="w-full text-xs text-muted">
        Saving does not regenerate the PDF — use &quot;Regenerate PDF&quot; afterward to apply these changes to the document.
      </p>
    </form>
  );
}

export function DeleteAgreementButton({ agreementId, studentId }: { agreementId: string; studentId: string }) {
  const [error, setError] = useState<string | null>(null);

  async function handleDelete() {
    if (!confirm("Delete this agreement? This cannot be undone.")) return;
    setError(null);
    const result = await deleteAgreement(agreementId, studentId);
    if (result?.error) setError(result.error);
  }

  return (
    <div>
      <button onClick={handleDelete} className="text-xs text-danger hover:underline">
        Delete
      </button>
      {error && <p className="mt-1 text-xs text-danger">{error}</p>}
    </div>
  );
}

export function UploadSignedAgreementForm({ agreementId, studentId }: { agreementId: string; studentId: string }) {
  const action = uploadSignedAgreement.bind(null, agreementId, studentId);
  const [state, formAction, pending] = useActionState(action, undefined);

  return (
    <form action={formAction} className="mt-2 flex flex-wrap items-center gap-2">
      <input type="file" name="file" required className="text-xs" />
      <label className="flex items-center gap-1 text-xs text-muted">
        <input type="checkbox" name="email_verified" /> Email verified
      </label>
      <Input name="video_recording_path" placeholder="Video recording path (e-sign only)" className="w-56" />
      <Button type="submit" variant="outline-primary" size="sm" pending={pending}>
        Upload signed agreement
      </Button>
      {state?.error && <p className="text-xs text-danger">{state.error}</p>}
    </form>
  );
}
