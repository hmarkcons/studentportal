"use client";

import { useActionState } from "react";
import { generateAgreement, uploadSignedAgreement } from "@/lib/actions/agreements";

export function GenerateAgreementForm({
  studentId,
  templates,
}: {
  studentId: string;
  templates: { id: string; signatory_name: string; destination: { display_name: string } | { display_name: string }[] | null }[];
}) {
  const action = generateAgreement.bind(null, studentId);
  const [state, formAction, pending] = useActionState(action, undefined);

  function destName(d: (typeof templates)[number]["destination"]) {
    return Array.isArray(d) ? d[0]?.display_name : d?.display_name;
  }

  return (
    <form action={formAction} className="flex flex-wrap items-end gap-2">
      <select name="template_id" required className="rounded-md border border-border px-2 py-1.5 text-sm">
        <option value="">Template…</option>
        {templates.map((t) => (
          <option key={t.id} value={t.id}>
            {destName(t.destination)}
          </option>
        ))}
      </select>
      <select name="signing_method" required className="rounded-md border border-border px-2 py-1.5 text-sm">
        <option value="paper">Paper (Karachi)</option>
        <option value="e_signature">E-signature (outside Karachi)</option>
      </select>
      <input name="admin_charge_override" type="number" step="0.01" placeholder="Admin charge override" className="w-40 rounded-md border border-border px-2 py-1.5 text-sm" />
      <input name="consultancy_fee_override" type="number" step="0.01" placeholder="Consultancy fee override" className="w-44 rounded-md border border-border px-2 py-1.5 text-sm" />
      <button type="submit" disabled={pending} className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-ink disabled:opacity-50">
        Generate agreement
      </button>
      {state?.error && <p className="text-xs text-danger">{state.error}</p>}
    </form>
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
      <input name="video_recording_path" placeholder="Video recording path (e-sign only)" className="w-56 rounded-md border border-border px-2 py-1 text-xs" />
      <button type="submit" disabled={pending} className="rounded-md border border-primary px-2 py-1 text-xs font-medium text-primary disabled:opacity-50">
        Upload signed agreement
      </button>
      {state?.error && <p className="text-xs text-danger">{state.error}</p>}
    </form>
  );
}
