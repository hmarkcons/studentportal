"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { replyToTicket } from "@/lib/actions/support";
import { Button } from "@/components/ui/Button";
import { Textarea } from "@/components/ui/Input";
import { EmptyState } from "@/components/ui/EmptyState";

export type TicketReplyRow = {
  id: string;
  author_type: string;
  author_name: string;
  body: string;
  created_at: string;
};

export function TicketThread({
  ticketId,
  authorType,
  replies,
  revalidateTo,
}: {
  ticketId: string;
  authorType: "staff" | "student";
  replies: TicketReplyRow[];
  revalidateTo: string;
}) {
  const action = replyToTicket.bind(null, ticketId, authorType, revalidateTo);
  const [state, formAction, pending] = useActionState(action, undefined);
  const [body, setBody] = useState("");
  const wasPending = useRef(false);

  useEffect(() => {
    if (wasPending.current && !pending && !state?.error) setBody("");
    wasPending.current = pending;
  }, [pending, state]);

  return (
    <div>
      <div className="flex flex-col gap-3">
        {replies.length === 0 && <EmptyState>No replies yet.</EmptyState>}
        {replies.map((r) => (
          <div
            key={r.id}
            className={`max-w-[85%] rounded-lg px-3 py-2 text-sm ${
              r.author_type === authorType ? "self-end bg-primary text-primary-ink" : "bg-bg text-ink"
            }`}
          >
            <p className="whitespace-pre-wrap">{r.body}</p>
            <p className="mt-1 text-[10px] opacity-70">
              {r.author_name} · {new Date(r.created_at).toLocaleString()}
            </p>
          </div>
        ))}
      </div>
      <form action={formAction} className="mt-3 flex flex-col gap-2">
        <Textarea name="body" placeholder="Write a reply…" required rows={3} value={body} onChange={(e) => setBody(e.target.value)} />
        <Button type="submit" variant="primary" pending={pending} className="self-start">
          Reply
        </Button>
      </form>
      {state?.error && <p className="mt-1 text-xs text-danger">{state.error}</p>}
    </div>
  );
}
