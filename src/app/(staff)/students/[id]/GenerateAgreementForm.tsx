"use client";

import { useActionState, useState } from "react";
import { generateAgreement, uploadSignedAgreement, deleteAgreement } from "@/lib/actions/agreements";
import { Button } from "@/components/ui/Button";
import { Input, Select } from "@/components/ui/Input";

export function GenerateAgreementForm({
  studentId,
  templates,
  discountAmount,
}: {
  studentId: string;
  templates: { id: string; name: string; signatory_name: string; destination: { display_name: string } | { display_name: string }[] | null }[];
  discountAmount?: number | null;
}) {
  const action = generateAgreement.bind(null, studentId);
  const [state, formAction, pending] = useActionState(action, undefined);

  function destName(d: (typeof templates)[number]["destination"]) {
    return Array.isArray(d) ? d[0]?.display_name : d?.display_name;
  }

  return (
    <form action={formAction} className="flex flex-wrap items-end gap-2">
      <Select name="template_id" required>
        <option value="">Template…</option>
        {templates.map((t) => (
          <option key={t.id} value={t.id}>
            {destName(t.destination)} — {t.name}
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
      <Button type="submit" variant="primary" pending={pending}>
        Generate agreement
      </Button>
      {state?.error && <p className="text-xs text-danger">{state.error}</p>}
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
