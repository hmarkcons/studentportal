"use client";

import { useActionState, useId, useState } from "react";
import { Pencil, Trash2 } from "lucide-react";
import { updateProgram, deleteProgram, upsertProgramCommissionRate } from "@/lib/actions/universities";
import { Button } from "@/components/ui/Button";
import { Input, Select, Textarea } from "@/components/ui/Input";
import { ActionStatus } from "@/components/ActionStatus";
import { useButtonAction } from "@/components/useButtonAction";
import { ProgramDates } from "@/components/ProgramDates";
import { ProgramRoundsFields } from "@/components/ProgramRoundsFields";
import { EmailLinks } from "@/components/EmailLinks";
import { SafeLink } from "@/components/SafeLink";
import type { ProgramRound } from "@/lib/programRounds";
import { FeeInput } from "@/components/FeeInput";
import { effectiveFee, formatFee, type FeeRow } from "@/lib/applicationFee";
import { EMAILS_MAX, LEVEL_MAX, STANDARD_LEVELS, YES_NO_MAX, yesNoLabel } from "@/lib/catalogueText";

export type ProgramCommissionRate = { rate_percent: number | null; fixed_amount: number | null; currency: string } | null;

export type ProgramRowData = {
  id: string;
  level: string;
  name: string;
  core_field: string | null;
  sub_field: string | null;
  tuition_fee: number | string | null;
  duration: string | null;
  language_requirement: string | null;
  application_fee: number | string | null;
  application_fee_currency: string | null;
  coordinator_email: string | null;
  // Every other catalogue field, editable here since 0304.
  page_link?: string | null;
  intake_dates?: string[] | null;
  /** "yes", "no", or words — or a boolean, read before 0304. */
  interview_required?: string | boolean | null;
  interview_details?: string | null;
  admission_test_required?: string | boolean | null;
  admission_test_type?: string | null;
  application_portal_name?: string | null;
  application_portal_link?: string | null;
  requirements_link?: string | null;
  academic_requirement?: string | null;
  rounds: ProgramRound[];
  commission_rate: ProgramCommissionRate;
};

function CommissionRateEditor({
  program,
  universityId,
  onDone,
}: {
  program: ProgramRowData;
  universityId: string;
  onDone: () => void;
}) {
  const action = upsertProgramCommissionRate.bind(null, program.id, universityId);
  const [state, formAction, pending] = useActionState(action, undefined);

  return (
    <form action={formAction} className="mt-1 flex flex-wrap items-end gap-2 rounded-md border border-border bg-bg p-2">
      <label className="flex flex-col gap-0.5 text-[10px] text-muted">
        Rate %
        <Input name="rate_percent" type="number" step="0.01" defaultValue={program.commission_rate?.rate_percent ?? ""} placeholder="e.g. 15" className="w-20 px-2 py-1 text-xs" />
      </label>
      <label className="flex flex-col gap-0.5 text-[10px] text-muted">
        Fixed amount
        <Input name="fixed_amount" type="number" step="0.01" defaultValue={program.commission_rate?.fixed_amount ?? ""} placeholder="Optional" className="w-24 px-2 py-1 text-xs" />
      </label>
      <label className="flex flex-col gap-0.5 text-[10px] text-muted">
        Currency
        <Select name="currency" defaultValue={program.commission_rate?.currency ?? "EUR"} className="px-2 py-1 text-xs">
          <option value="EUR">EUR</option>
          <option value="USD">USD</option>
          <option value="PKR">PKR</option>
          <option value="GBP">GBP</option>
        </Select>
      </label>
      <Button type="submit" variant="outline-primary" size="sm" pending={pending} status={{ state, label: "Saved." }}>
        Save
      </Button>
      <Button type="button" variant="ghost" size="sm" onClick={onDone}>
        Close
      </Button>
      {state?.error && <p className="w-full text-xs text-danger">{state.error}</p>}
    </form>
  );
}

/** A labelled field in the edit form. */
function Field({ label, children, wide = false }: { label: string; children: React.ReactNode; wide?: boolean }) {
  return (
    <label className={`flex flex-col gap-0.5 text-[11px] text-muted ${wide ? "sm:col-span-2" : ""}`}>
      {label}
      {children}
    </label>
  );
}

/** "yes", "no", or words — and the stored value shown as it would be written in the box. */
function yesNoValue(value: string | boolean | null | undefined): string {
  if (value === true) return "yes";
  if (value === false) return "no";
  return value ?? "";
}

/**
 * The line of details under a programme: what the edit form holds beyond the
 * name and the fee. Each is shown as written — a yes/no as "Yes", "No" or its
 * words, a link only where it is a real web address.
 */
function ProgrammeDetails({ program }: { program: ProgramRowData }) {
  const parts: React.ReactNode[] = [];
  const interview = yesNoLabel(program.interview_required ?? null);
  const test = yesNoLabel(program.admission_test_required ?? null);
  if (program.duration) parts.push(<>Duration {program.duration}</>);
  if (program.language_requirement) parts.push(<>Language {program.language_requirement}</>);
  if (program.intake_dates?.length) parts.push(<>Intakes {program.intake_dates.join("; ")}</>);
  if (interview) parts.push(<>Interview: {interview}{program.interview_details ? ` (${program.interview_details})` : ""}</>);
  if (test) parts.push(<>Admission test: {test}{program.admission_test_type ? ` (${program.admission_test_type})` : ""}</>);
  if (program.page_link) parts.push(<>Course page <SafeLink value={program.page_link} /></>);
  if (program.application_portal_link || program.application_portal_name) {
    parts.push(
      <>
        Portal{" "}
        {program.application_portal_link ? (
          <SafeLink value={program.application_portal_link}>{program.application_portal_name || undefined}</SafeLink>
        ) : (
          program.application_portal_name
        )}
      </>
    );
  }
  if (parts.length === 0) return null;
  return (
    <span className="block text-xs text-muted" data-programme-details>
      {parts.map((part, i) => (
        <span key={i}>
          {i > 0 && " · "}
          {part}
        </span>
      ))}
    </span>
  );
}

export function ProgramRow({
  program,
  universityId,
  canEdit = false,
  canViewRate = false,
  canManageRate = false,
  today,
  universityFee = null,
  destinationCurrency = "EUR",
  levelOptions = STANDARD_LEVELS,
}: {
  program: ProgramRowData;
  universityId: string;
  canEdit?: boolean;
  canViewRate?: boolean;
  canManageRate?: boolean;
  /** Karachi's today, from the server — see ProgramDates. */
  today?: string;
  /** The university's fee, which this programme charges unless it has its own. */
  universityFee?: FeeRow | null;
  destinationCurrency?: string;
  /** Levels the level box suggests: the three, and any others this university already uses. */
  levelOptions?: readonly string[];
}) {
  const fee = effectiveFee(program, universityFee, destinationCurrency);
  const [editing, setEditing] = useState(false);
  const [editingRate, setEditingRate] = useState(false);
  const del = useButtonAction();
  const action = updateProgram.bind(null, program.id, universityId);
  const [state, formAction, pending] = useActionState(action, undefined);
  const ids = useId();

  async function handleDelete() {
    if (!confirm(`Delete ${program.name}?`)) return;
    // The row goes with the programme, so success is a toast; a refusal is
    // said beside the icon that is still there.
    await del.run(() => deleteProgram(program.id, universityId), { toast: "Deleted." });
  }

  if (!editing) {
    return (
      <div className="py-2">
        <div className="flex items-center justify-between gap-3 text-sm">
          <span className="min-w-0 text-ink">
            {program.level} · {program.name}
            {program.core_field && <span className="text-muted"> · {program.core_field}</span>}
            {/* The dates belong in the list, not only behind the edit pencil.
                A counselor scanning a university's programmes is usually
                looking for the one whose deadline has not gone yet — which is
                also why this leads with the open round rather than the first. */}
            <ProgramDates rounds={program.rounds} today={today} inline />
            {(fee || program.coordinator_email) && (
              <span className="block text-xs text-muted">
                {fee && (
                  <span data-application-fee>
                    Application fee {formatFee(fee.amount, fee.currency)}
                    {fee.from === "university" && " (the university's)"}
                  </span>
                )}
                {fee && program.coordinator_email && " · "}
                {program.coordinator_email && (
                  <span data-coordinator>
                    Coordinator <EmailLinks value={program.coordinator_email} />
                  </span>
                )}
              </span>
            )}
            <ProgrammeDetails program={program} />
          </span>
          <div className="flex shrink-0 items-center gap-3">
            {program.tuition_fee != null && <span className="text-muted">{program.tuition_fee}</span>}
            {canViewRate && (
              <span className="text-xs text-muted">
                Commission:{" "}
                {program.commission_rate ? (
                  program.commission_rate.fixed_amount != null
                    ? `flat ${program.commission_rate.currency} ${program.commission_rate.fixed_amount}`
                    : `${program.commission_rate.rate_percent}%`
                ) : (
                  "not set"
                )}
                {canManageRate && (
                  <button onClick={() => setEditingRate(true)} className="ml-1 text-primary hover:underline">
                    edit
                  </button>
                )}
              </span>
            )}
            {canEdit && (
              <>
                <button onClick={() => setEditing(true)} title="Edit program" aria-label="Edit program" className="rounded p-1 text-muted hover:bg-bg hover:text-primary">
                  <Pencil className="h-4 w-4 shrink-0" aria-hidden />
                </button>
                <span className="inline-flex items-center gap-2">
                  <button
                    onClick={handleDelete}
                    disabled={del.pending}
                    aria-busy={del.pending || undefined}
                    title="Delete program"
                    aria-label="Delete program"
                    className="w-fit rounded p-1 text-muted hover:bg-danger-bg hover:text-danger disabled:opacity-50"
                  >
                    <Trash2 className="h-4 w-4 shrink-0" aria-hidden />
                  </button>
                  <ActionStatus state={del.state} pending={del.pending} label="Deleted." showError />
                </span>
              </>
            )}
          </div>
        </div>

        {editingRate && canManageRate && (
          <CommissionRateEditor program={program} universityId={universityId} onDone={() => setEditingRate(false)} />
        )}
      </div>
    );
  }

  // Every catalogue field, labelled (0304). Anything may be written in any of
  // them: a level of the university's own, several emails, words for yes/no,
  // words for a date. Field names match the catalogue sheet's columns.
  const levelsId = `${ids}-levels`;
  const yesNoId = `${ids}-yesno`;
  return (
    <form action={formAction} className="flex flex-col gap-2 border-b border-border py-3 last:border-0">
      <datalist id={levelsId}>
        {levelOptions.map((l) => (
          <option key={l} value={l} />
        ))}
      </datalist>
      <datalist id={yesNoId}>
        <option value="yes" />
        <option value="no" />
      </datalist>

      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <Field label="Level *">
          <Input name="level" list={levelsId} defaultValue={program.level} required maxLength={LEVEL_MAX} placeholder="bachelors, masters, phd, or other" />
        </Field>
        <Field label="Name *" wide>
          <Input name="name" defaultValue={program.name} required />
        </Field>
        <Field label="Duration">
          <Input name="duration" defaultValue={program.duration ?? ""} placeholder="e.g. 2 years" />
        </Field>
        <Field label="Core field">
          <Input name="core_field" defaultValue={program.core_field ?? ""} />
        </Field>
        <Field label="Sub-field">
          <Input name="sub_field" defaultValue={program.sub_field ?? ""} />
        </Field>
        <Field label="Tuition fee — several separated by a comma and a space">
          <Input name="tuition_fee" type="text" maxLength={500} defaultValue={program.tuition_fee ?? ""} placeholder="e.g. 3000, 4500 (non-EU)" aria-label="Tuition fee" />
        </Field>
        <Field label="Application fee — blank charges the university's">
          <FeeInput
            compact
            amount={program.application_fee}
            currency={program.application_fee_currency ?? universityFee?.application_fee_currency ?? destinationCurrency}
          />
        </Field>
        <Field label="Coordinator email(s) — separated by commas" wide>
          <Input
            name="coordinator_email"
            type="text"
            maxLength={EMAILS_MAX}
            defaultValue={program.coordinator_email ?? ""}
            placeholder="a@university.it, b@university.it"
            aria-label="Coordinator email"
          />
        </Field>
        <Field label="Language requirement">
          <Input name="language_requirement" defaultValue={program.language_requirement ?? ""} placeholder="e.g. B2 English" />
        </Field>
        <Field label="Intakes — separated by semicolons">
          <Input name="intake_dates" defaultValue={(program.intake_dates ?? []).join("; ")} placeholder="Fall; Spring" />
        </Field>
        <Field label="Interview — yes, no, or words">
          <Input name="interview_required" list={yesNoId} maxLength={YES_NO_MAX} defaultValue={yesNoValue(program.interview_required)} placeholder="e.g. Only for non-EU students" />
        </Field>
        <Field label="Interview details">
          <Input name="interview_details" defaultValue={program.interview_details ?? ""} />
        </Field>
        <Field label="Admission test — yes, no, or words">
          <Input name="admission_test_required" list={yesNoId} maxLength={YES_NO_MAX} defaultValue={yesNoValue(program.admission_test_required)} />
        </Field>
        <Field label="Admission test type">
          <Input name="admission_test_type" defaultValue={program.admission_test_type ?? ""} placeholder="e.g. TOLC-I" />
        </Field>
        <Field label="Course page">
          <Input name="page_link" defaultValue={program.page_link ?? ""} placeholder="https://… or a note" />
        </Field>
        <Field label="Application portal">
          <Input name="application_portal_name" defaultValue={program.application_portal_name ?? ""} placeholder="e.g. Universitaly" />
        </Field>
        <Field label="Application portal link">
          <Input name="application_portal_link" defaultValue={program.application_portal_link ?? ""} placeholder="https://… or a note" />
        </Field>
        <Field label="Requirements link">
          <Input name="requirements_link" defaultValue={program.requirements_link ?? ""} placeholder="https://… or a note" />
        </Field>
        <Field label="Academic requirement" wide>
          <Textarea name="academic_requirement" defaultValue={program.academic_requirement ?? ""} rows={2} />
        </Field>
      </div>

      <ProgramRoundsFields rounds={program.rounds} />
      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" variant="outline-primary" size="sm" pending={pending} status={{ state, label: "Saved." }}>
          Save
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={() => setEditing(false)}>
          Cancel
        </Button>
        {state?.error && <p className="w-full text-xs text-danger">{state.error}</p>}
      </div>
    </form>
  );
}
