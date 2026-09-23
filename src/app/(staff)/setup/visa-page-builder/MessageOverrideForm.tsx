"use client";

import { useActionState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Input, Textarea } from "@/components/ui/Input";
import { ActionStatus } from "@/components/ActionStatus";
import { useButtonAction } from "@/components/useButtonAction";
import { saveVisaMessageOverride, clearVisaMessageOverride } from "@/lib/actions/visaPageBuilder";
import type { VisaMessageFields } from "@/lib/visaPage";

function Field({
  label,
  name,
  shared,
  value,
  rows,
}: {
  label: string;
  name: string;
  shared: string | null;
  value: string | null;
  rows?: number;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-muted">{label}</span>
      {rows ? (
        <Textarea name={name} defaultValue={value ?? ""} rows={rows} maxLength={2000} placeholder={shared ?? ""} />
      ) : (
        <Input name={name} defaultValue={value ?? ""} maxLength={300} placeholder={shared ?? ""} />
      )}
      {/* The shared wording sits in the placeholder, so leaving a box empty
          visibly means "use that" rather than "say nothing". */}
      <span className="mt-1 block text-[11px] text-muted">
        {shared ? "Empty uses the shared wording shown in grey." : "No shared wording set for this field."}
      </span>
    </label>
  );
}

/**
 * One country's own wording for the approved and refused messages.
 *
 * Field by field on purpose: a refusal in Italy and a refusal in the UK are
 * not the same conversation, but the sign-off usually is, and an override
 * that replaced everything would make the office re-type the parts that were
 * already right.
 */
export function MessageOverrideForm({
  destinationId,
  destinationName,
  shared,
  override,
  hasOverride,
  canEdit,
}: {
  destinationId: string;
  destinationName: string;
  shared: VisaMessageFields | null;
  override: VisaMessageFields | null;
  hasOverride: boolean;
  canEdit: boolean;
}) {
  const action = saveVisaMessageOverride.bind(null, destinationId);
  const [state, formAction, pending] = useActionState(action, undefined);
  const router = useRouter();
  const clearing = useButtonAction();

  async function clear() {
    if (!confirm(`Drop ${destinationName}'s own wording and go back to the shared message?`)) return;
    // The button goes once there is no override left to clear, so success is
    // a toast; a refusal is said beside it — it used to be dropped unread.
    await clearing.run(async () => {
      const result = await clearVisaMessageOverride(destinationId);
      if (!result?.error) router.refresh();
      return result;
    }, { toast: "Cleared." });
  }

  if (!canEdit) {
    return (
      <p className="text-xs text-muted">
        {hasOverride
          ? `${destinationName} has its own wording for the visa decision message.`
          : `${destinationName} uses the shared visa decision message.`}
      </p>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <p className="text-xs text-muted">
        {hasOverride
          ? `${destinationName} has its own wording. Anything left empty falls back to the shared message.`
          : `${destinationName} uses the shared message. Fill in only what should differ.`}
      </p>

      <div className="grid gap-3 md:grid-cols-2">
        <div className="flex flex-col gap-3">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-success">When the visa is approved</p>
          <Field label="Heading" name="approved_heading" shared={shared?.approved_heading ?? null} value={override?.approved_heading ?? null} />
          <Field label="Body" name="approved_body" shared={shared?.approved_body ?? null} value={override?.approved_body ?? null} rows={5} />
          <Field label="Sign-off" name="approved_signoff" shared={shared?.approved_signoff ?? null} value={override?.approved_signoff ?? null} />
        </div>
        <div className="flex flex-col gap-3">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-warning">When it is refused</p>
          <Field label="Heading" name="refused_heading" shared={shared?.refused_heading ?? null} value={override?.refused_heading ?? null} />
          <Field label="Body" name="refused_body" shared={shared?.refused_body ?? null} value={override?.refused_body ?? null} rows={5} />
          <Field label="Sign-off" name="refused_signoff" shared={shared?.refused_signoff ?? null} value={override?.refused_signoff ?? null} />
        </div>
      </div>

      {state?.error && <p className="text-xs text-danger">{state.error}</p>}
      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" variant="primary" pending={pending}>
          Save this country&rsquo;s wording
        </Button>
        <ActionStatus state={state} pending={pending} />
        {hasOverride && (
          <span className="inline-flex items-center gap-2">
            <button
              type="button"
              onClick={clear}
              disabled={clearing.pending}
              className="w-fit text-xs text-danger hover:underline disabled:opacity-40"
            >
              {clearing.pending ? "Clearing…" : "Use the shared message instead"}
            </button>
            <ActionStatus state={clearing.state} pending={clearing.pending} label="Cleared." showError />
          </span>
        )}
      </div>
    </form>
  );
}
