"use client";

import Link from "next/link";
import { useActionState } from "react";
import { listFromCampaignRecipients } from "@/lib/actions/emailReports";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";

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
