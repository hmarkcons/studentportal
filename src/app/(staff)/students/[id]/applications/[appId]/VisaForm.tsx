"use client";

import { useActionState } from "react";
import { updateVisaRecord } from "@/lib/actions/applications";
import { CredentialField } from "@/components/CredentialField";

export function VisaForm({
  applicationId,
  studentId,
  visa,
}: {
  applicationId: string;
  studentId: string;
  visa: {
    outcome: string;
    outcome_reason: string | null;
    biometric_appointment: string | null;
    interview_appointment: string | null;
    medical_appointment: string | null;
  } | null;
}) {
  const action = updateVisaRecord.bind(null, applicationId, studentId);
  const [state, formAction, pending] = useActionState(action, undefined);

  const toLocal = (v: string | null) => (v ? v.slice(0, 16) : "");

  return (
    <div className="flex flex-col gap-4">
    <form action={formAction} className="grid grid-cols-2 gap-3">
      <div className="flex flex-col gap-1">
        <label className="text-xs text-muted">Biometric appointment</label>
        <input type="datetime-local" name="biometric_appointment" defaultValue={toLocal(visa?.biometric_appointment ?? null)} className="rounded-md border border-border px-2 py-1.5 text-sm" />
      </div>
      <div className="flex flex-col gap-1">
        <label className="text-xs text-muted">Interview appointment</label>
        <input type="datetime-local" name="interview_appointment" defaultValue={toLocal(visa?.interview_appointment ?? null)} className="rounded-md border border-border px-2 py-1.5 text-sm" />
      </div>
      <div className="flex flex-col gap-1">
        <label className="text-xs text-muted">Medical appointment</label>
        <input type="datetime-local" name="medical_appointment" defaultValue={toLocal(visa?.medical_appointment ?? null)} className="rounded-md border border-border px-2 py-1.5 text-sm" />
      </div>
      <div className="flex flex-col gap-1">
        <label className="text-xs text-muted">Outcome</label>
        <select name="outcome" defaultValue={visa?.outcome ?? "pending"} className="rounded-md border border-border px-2 py-1.5 text-sm">
          <option value="pending">Pending</option>
          <option value="approved">Approved</option>
          <option value="rejected">Rejected</option>
          <option value="rfe">RFE</option>
        </select>
      </div>
      <div className="col-span-2 flex flex-col gap-1">
        <label className="text-xs text-muted">Outcome reason</label>
        <input name="outcome_reason" defaultValue={visa?.outcome_reason ?? ""} className="rounded-md border border-border px-2 py-1.5 text-sm" />
      </div>
      {state?.error && <p className="col-span-2 text-xs text-danger">{state.error}</p>}
      <button type="submit" disabled={pending} className="col-span-2 justify-self-start rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-ink disabled:opacity-50">
        Save visa record
      </button>
    </form>
    <CredentialField
      label="Visa appointment portal (VFS/Consulate)"
      ownerType="application"
      ownerId={applicationId}
      credentialType="vfs_appointment"
      revalidateTo={`/students/${studentId}/applications/${applicationId}`}
    />
    </div>
  );
}
