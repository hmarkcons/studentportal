"use client";

import Link from "next/link";
import { useActionState } from "react";
import { followUpTasksFromCampaign, listFromCampaignRecipients } from "@/lib/actions/emailReports";
import { Button } from "@/components/ui/Button";
import { Input, Select, Textarea } from "@/components/ui/Input";

/** Makes an email list of the recipients the report is showing. */
export function MakeListForm({ campaignId, filter, filterLabel, count }: { campaignId: string; filter: string; filterLabel: string; count: number }) {
  const [state, action, pending] = useActionState(listFromCampaignRecipients.bind(null, campaignId), undefined);
  return (
    <form action={action} className="flex flex-col gap-2 sm:flex-row sm:items-end" data-make-list>
      <input type="hidden" name="filter" value={filter} />
      <label className="flex flex-1 flex-col gap-1 text-xs text-muted">
        Make a list of these {count.toLocaleString("en-US")} ({filterLabel.toLowerCase()}) — for a follow-up campaign
        <Input name="name" maxLength={120} placeholder="List name (optional)" />
      </label>
      <Button type="submit" variant="outline-primary" pending={pending} disabled={count === 0}>
        Make a list
      </Button>
      {state && "error" in state && <p className="text-xs text-danger">{state.error}</p>}
      {state && "success" in state && (
        <p className="text-xs text-success" data-make-list-done>
          {state.message}{" "}
          <Link prefetch={false} href={`/marketing/email/audience/lists/${state.listId}`} className="underline">
            Open it
          </Link>
        </p>
      )}
    </form>
  );
}

/** Follow-up tasks for the leads the report is showing, each to that lead's own counsellor. */
export function FollowUpTasksForm({
  campaignId,
  filter,
  filterLabel,
  count,
  defaultTitle,
  defaultDue,
  people,
}: {
  campaignId: string;
  filter: string;
  filterLabel: string;
  count: number;
  defaultTitle: string;
  defaultDue: string;
  people: { id: string; name: string }[];
}) {
  const [state, action, pending] = useActionState(followUpTasksFromCampaign.bind(null, campaignId), undefined);
  return (
    <form action={action} className="flex flex-col gap-3" data-follow-up>
      <input type="hidden" name="filter" value={filter} />
      <div>
        <h3 className="text-sm font-medium text-ink">Give follow-up tasks</h3>
        <p className="text-[11px] text-muted">
          One task for each lead among these {count.toLocaleString("en-US")} ({filterLabel.toLowerCase()}), given to that lead&rsquo;s own counsellor and
          linked to the lead. Imported contacts are left out; a lead who already has this task open is not given it twice.
        </p>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,1fr)_10rem]">
        <label className="flex flex-col gap-1 text-xs text-muted">
          Task
          <Input name="title" defaultValue={defaultTitle} maxLength={200} required />
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted">
          Due
          <Input name="due_date" type="date" defaultValue={defaultDue} required />
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted sm:col-span-2">
          Notes <span className="text-[10px]">(optional — blank says which campaign and filter it came from)</span>
          <Textarea name="notes" rows={2} maxLength={4000} />
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted sm:col-span-2">
          Leads with no counsellor go to
          <Select name="fallback_owner" defaultValue="">
            <option value="">Nobody — skip them</option>
            {people.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </Select>
        </label>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" variant="outline-primary" pending={pending} disabled={count === 0}>
          Give the tasks
        </Button>
        {state && "error" in state && <p className="text-xs text-danger">{state.error}</p>}
        {state && "success" in state && (
          <p className="text-xs text-success" data-follow-up-done>
            {state.message}
          </p>
        )}
      </div>
    </form>
  );
}
