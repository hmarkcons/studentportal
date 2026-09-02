"use client";

import { useActionState, useState } from "react";
import { generateAgreement, updateAgreement, uploadSignedAgreement, deleteAgreement } from "@/lib/actions/agreements";
import { Button } from "@/components/ui/Button";
import { Input, Select } from "@/components/ui/Input";

type AgreementTemplateOption = {
  id: string;
  name: string;
  signatory_name: string;
  destination: { display_name: string } | { display_name: string }[] | null;
};

function templateDestName(d: AgreementTemplateOption["destination"]) {
  return Array.isArray(d) ? d[0]?.display_name : d?.display_name;
}

export function GenerateAgreementForm({
  studentId,
  templates,
  discountAmount,
}: {
  studentId: string;
  templates: AgreementTemplateOption[];
  discountAmount?: number | null;
}) {
  const action = generateAgreement.bind(null, studentId);
  const [state, formAction, pending] = useActionState(action, undefined);

  return (
    <form action={formAction} className="flex flex-wrap items-end gap-2">
      <Select name="template_id" required>
        <option value="">Template…</option>
        {templates.map((t) => (
          <option key={t.id} value={t.id}>
            {templateDestName(t.destination)} — {t.name}
          </option>
        ))}
      </Select>
      <Select name="signing_method" required>
        <option value="paper">Paper (Karachi)</option>
        <option value="e_signature">E-signature (outside Karachi)</option>
      </Select>
      <Input name="admin_charge_override" type="number" step="0.01" placeholder="Admin charge override" className="w-40" />
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
      <Button type="submit" variant="primary" pending={pending}>
        Generate agreement
      </Button>
      {state?.error && <p className="text-xs text-danger">{state.error}</p>}
    </form>
  );
}

export function EditAgreementForm({
  agreement,
  studentId,
  templates,
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
}) {
  const [editing, setEditing] = useState(false);
  const action = updateAgreement.bind(null, agreement.id, studentId);
  const [state, formAction, pending] = useActionState(action, undefined);

  if (!editing) {
    return (
      <button type="button" onClick={() => setEditing(true)} className="text-xs text-primary hover:underline">
        Edit
      </button>
    );
  }

  return (
    <form action={formAction} className="mt-2 flex w-full flex-wrap items-end gap-2 rounded-md border border-border p-2">
      <Select name="template_id" defaultValue={agreement.template_id ?? ""} required>
        <option value="">Template…</option>
        {templates.map((t) => (
          <option key={t.id} value={t.id}>
            {templateDestName(t.destination)} — {t.name}
          </option>
        ))}
      </Select>
      <Select name="signing_method" defaultValue={agreement.signing_method ?? "paper"} required>
        <option value="paper">Paper (Karachi)</option>
        <option value="e_signature">E-signature (outside Karachi)</option>
      </Select>
      <Input
        name="admin_charge_override"
        type="number"
        step="0.01"
        placeholder="Admin charge override"
        defaultValue={agreement.admin_charge_override ?? ""}
        className="w-40"
      />
      <Input
        name="consultancy_fee_override"
        type="number"
        step="0.01"
        placeholder="Consultancy fee override"
        defaultValue={agreement.consultancy_fee_override ?? ""}
        className="w-44"
      />
      <Input
        name="discount_amount"
        type="number"
        step="0.01"
        placeholder="Discount amount"
        defaultValue={agreement.discount_amount ?? ""}
        className="w-36"
      />
      <Select name="installment_count" defaultValue={String(agreement.installment_count ?? 1)}>
        <option value="1">1 consultancy fee installment</option>
        <option value="2">2 consultancy fee installments</option>
        <option value="3">3 consultancy fee installments</option>
      </Select>
      <Button type="submit" variant="primary" size="sm" pending={pending}>
        Save
      </Button>
      <Button type="button" variant="ghost" size="sm" onClick={() => setEditing(false)}>
        Cancel
      </Button>
      {state?.error && <p className="w-full text-xs text-danger">{state.error}</p>}
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
