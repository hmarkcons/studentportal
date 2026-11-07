"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { addPastedToEmailList, deleteEmailList, removeEmailListMember, saveEmailList, type AddReport } from "@/lib/actions/emailAudience";
import { useButtonAction } from "@/components/useButtonAction";
import { Button } from "@/components/ui/Button";
import { Input, Textarea } from "@/components/ui/Input";

/** Creates a list, or renames one. */
export function ListDetailsForm({ listId, name = "", description = "" }: { listId?: string; name?: string; description?: string }) {
  const router = useRouter();
  const [state, action, pending] = useActionState(saveEmailList.bind(null, listId ?? null), undefined);
  useEffect(() => {
    if (state && "success" in state && !listId) router.push(`/marketing/email/audience/lists/${state.listId}`);
  }, [state, listId, router]);
  return (
    <form action={action} className="flex flex-col gap-2 sm:flex-row sm:items-end">
      <label className="flex flex-1 flex-col gap-1 text-xs text-muted">
        List name
        <Input name="name" defaultValue={name} required maxLength={120} placeholder="e.g. Education Expo Karachi 2026" />
      </label>
      <label className="flex flex-1 flex-col gap-1 text-xs text-muted">
        Description <span className="text-[10px]">(optional)</span>
        <Input name="description" defaultValue={description} maxLength={500} />
      </label>
      <Button type="submit" variant={listId ? "outline" : "primary"} pending={pending} status={{ state, label: "Saved." }}>
        {listId ? "Save" : "Create list"}
      </Button>
    </form>
  );
}

/** A report of who was added, said plainly. */
export function AddReportView({ report }: { report: AddReport }) {
  return (
    <div className="rounded-md border border-border bg-bg p-3 text-xs text-ink" data-add-report>
      <p className="font-medium">
        {report.added.toLocaleString("en-US")} added to the list
        {report.alreadyOnList ? ` · ${report.alreadyOnList} already on it` : ""}.
      </p>
      <ul className="mt-1 list-disc pl-4 text-muted">
        {report.leads > 0 && <li>{report.leads} were leads already, and joined as themselves.</li>}
        {report.existingContacts > 0 && <li>{report.existingContacts} were imported contacts already.</li>}
        {report.newContacts > 0 && <li>{report.newContacts} new contacts were made, with the consent you gave.</li>}
        {report.duplicates > 0 && <li>{report.duplicates} repeated addresses were counted once.</li>}
        {report.suppressed > 0 && <li>{report.suppressed} are on the do-not-email list: on the list, but no campaign will reach them.</li>}
        {report.invalid.length > 0 && (
          <li>
            {report.invalid.length} could not be used:
            <ul className="list-disc pl-4">
              {report.invalid.slice(0, 15).map((p, i) => (
                <li key={i} className="break-all">
                  {p.value} — {p.reason}
                </li>
              ))}
              {report.invalid.length > 15 && <li>and {report.invalid.length - 15} more</li>}
            </ul>
          </li>
        )}
      </ul>
    </div>
  );
}

/** Addresses pasted in, one per line or separated by commas. */
export function PasteToListForm({ listId }: { listId: string }) {
  const router = useRouter();
  const [state, action, pending] = useActionState(addPastedToEmailList.bind(null, listId), undefined);
  useEffect(() => {
    if (state && "success" in state) router.refresh();
  }, [state, router]);
  return (
    <form action={action} className="flex flex-col gap-2" data-paste-to-list>
      <label className="flex flex-col gap-1 text-xs text-muted">
        Email addresses — one per line, or separated by commas
        <Textarea name="emails" rows={4} placeholder={"ali@example.com\nsara@example.com"} required />
      </label>
      <label className="flex flex-col gap-1 text-xs text-muted">
        Where these people agreed to hear from HMARK <span className="text-[10px]">(recorded for anyone not already a lead)</span>
        <Input name="consent_source" maxLength={200} placeholder="e.g. Sign-up sheet, Education Expo Karachi, 2026" />
      </label>
      <div className="flex items-center gap-2">
        <Button type="submit" size="sm" variant="outline-primary" pending={pending}>
          Add to the list
        </Button>
        {state && "error" in state && <p className="text-xs text-danger">{state.error}</p>}
      </div>
      {state && "success" in state && <AddReportView report={state.report} />}
    </form>
  );
}

export function RemoveMemberButton({ listId, memberId }: { listId: string; memberId: string }) {
  const router = useRouter();
  const run = useButtonAction();
  return (
    <Button
      size="sm"
      variant="ghost"
      pending={run.pending}
      status={{ state: run.state, label: "Removed.", showError: true }}
      onClick={async () => {
        const r = await run.run(() => removeEmailListMember(listId, memberId));
        if (r && "success" in r) router.refresh();
      }}
    >
      Remove
    </Button>
  );
}

export function DeleteListButton({ listId }: { listId: string }) {
  const router = useRouter();
  const run = useButtonAction();
  return (
    <Button
      size="sm"
      variant="danger"
      pending={run.pending}
      status={{ state: run.state, label: "Deleted.", showError: true }}
      onClick={async () => {
        if (!confirm("Delete this list? The people stay in the portal; only the list goes.")) return;
        const r = await run.run(() => deleteEmailList(listId));
        if (r && "success" in r) router.push("/marketing/email/audience/lists");
      }}
    >
      Delete list
    </Button>
  );
}
