"use client";

import { useActionState } from "react";
import { updateUniversity, deleteUniversity } from "@/lib/actions/universities";
import { Button } from "@/components/ui/Button";
import { ActionStatus } from "@/components/ActionStatus";
import { useButtonAction } from "@/components/useButtonAction";
import { Input, Select } from "@/components/ui/Input";
import { FeeInput } from "@/components/FeeInput";
import { autoShortName } from "@/lib/finalizedStage";
import { EMAILS_MAX, TYPED_SHORT_NAME_MAX } from "@/lib/catalogueText";

type University = {
  id: string;
  name: string;
  short_name?: string | null;
  city: string | null;
  region: string | null;
  type: string;
  status: string;
  contact_email: string | null;
  levels_offered?: string[] | null;
  fields_offered?: string[] | null;
  application_fee: number | string | null;
  application_fee_currency: string | null;
  dsu_body_id: string | null;
};

export function UniversityEditForm({
  university,
  dsuBodies,
  destinationCurrency,
}: {
  university: University;
  /** The bodies that serve this university's country (Setup → Scholarship bodies). */
  dsuBodies: { id: string; name: string }[];
  destinationCurrency: string;
}) {
  const action = updateUniversity.bind(null, university.id);
  const [state, formAction, pending] = useActionState(action, undefined);
  const del = useButtonAction();

  async function handleDelete() {
    if (!confirm(`Delete ${university.name}? This also deletes all its programs.`)) return;
    // deleteUniversity redirects on success (it throws internally, it never
    // returns) — this only resolves to a value on the error path, and that
    // error is said beside the button. Success leaves the page: a toast.
    await del.run(() => deleteUniversity(university.id), { toast: "Deleted." });
  }

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-xs text-muted">
          Name
          <Input name="name" defaultValue={university.name} required />
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted">
          Short name
          <Input name="short_name" defaultValue={university.short_name ?? ""} maxLength={TYPED_SHORT_NAME_MAX} placeholder={autoShortName(university.name)} />
          <span className="text-[11px]">Shown under a finalized student&apos;s Pre-Enrolled / University Finalized step. Blank shortens the name itself, as shown.</span>
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted">
          Type
          <Select name="type" defaultValue={university.type} required>
            <option value="public">Public</option>
            <option value="private">Private</option>
          </Select>
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted">
          City
          <Input name="city" defaultValue={university.city ?? ""} required />
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted">
          Region
          <Input name="region" defaultValue={university.region ?? ""} />
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted">
          University email(s)
          <Input
            name="contact_email"
            type="text"
            maxLength={EMAILS_MAX}
            defaultValue={university.contact_email ?? ""}
            placeholder="admissions@…, international@…"
          />
          <span className="text-[11px]">Several separated by commas, or a note.</span>
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted">
          Levels offered
          <Input name="levels_offered" defaultValue={(university.levels_offered ?? []).join("; ")} placeholder="Bachelors; Masters" />
          <span className="text-[11px]">Separated by semicolons.</span>
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted">
          Fields offered
          <Input name="fields_offered" defaultValue={(university.fields_offered ?? []).join("; ")} placeholder="Engineering; Medicine" />
          <span className="text-[11px]">Separated by semicolons.</span>
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted">
          Status
          <Select name="status" defaultValue={university.status}>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </Select>
        </label>
        <div className="flex flex-col gap-1 text-xs text-muted">
          <span>Application fee</span>
          <FeeInput amount={university.application_fee} currency={university.application_fee_currency ?? destinationCurrency} />
          <span className="text-[11px]">Charged for every programme here, unless a programme has a fee of its own.</span>
        </div>
        <label className="flex flex-col gap-1 text-xs text-muted">
          DSU body
          {/* Never disabled: a disabled select is left out of the form, and
              saving would then clear a body that is on file. */}
          <Select name="dsu_body_id" defaultValue={university.dsu_body_id ?? ""}>
            <option value="">{dsuBodies.length === 0 ? "No scholarship body serves this country" : "None chosen"}</option>
            {dsuBodies.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </Select>
          <span className="text-[11px]">
            The body that pays this university&rsquo;s students — offered on their Scholarship tab instead of a guess.
          </span>
        </label>
      </div>
      {state?.error && <p className="text-xs text-danger">{state.error}</p>}
      <div className="flex items-center justify-between">
        <Button type="submit" variant="primary" pending={pending} status={{ state, label: "Saved." }}>
          Save changes
        </Button>
        <span className="inline-flex items-center gap-2">
          <ActionStatus state={del.state} pending={del.pending} label="Deleted." showError />
          <button
            type="button"
            onClick={handleDelete}
            disabled={del.pending}
            aria-busy={del.pending || undefined}
            className="w-fit text-xs text-danger hover:underline disabled:opacity-50"
          >
            Delete university
          </button>
        </span>
      </div>
    </form>
  );
}
