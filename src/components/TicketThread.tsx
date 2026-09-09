"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { replyToTicket } from "@/lib/actions/support";
import { Button } from "@/components/ui/Button";
import { Textarea } from "@/components/ui/Input";
import { EmptyState } from "@/components/ui/EmptyState";
import { formatStamp } from "@/lib/activityStamp";
import { TICKET_BODY_MAX } from "@/lib/supportTickets";

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
  /**
   * Which side is reading, for laying the conversation out — the reader's own
   * messages to the right. It is NOT sent to the server: the action derives the
   * author from who is signed in, because a bound argument is client-supplied
   * and this one used to decide whose name a reply was posted under.
   */
  authorType: "staff" | "student";
  replies: TicketReplyRow[];
  revalidateTo: string;
}) {
  const action = replyToTicket.bind(null, ticketId, revalidateTo);
  const [state, formAction, pending] = useActionState(action, undefined);
  const [body, setBody] = useState("");
  const wasPending = useRef(false);

  useEffect(() => {
    if (wasPending.current && !pending && !state?.error) setBody("");
    wasPending.current = pending;
  }, [pending, state]);

  const over = body.trim().length > TICKET_BODY_MAX;

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
              {r.author_name} · {formatStamp(r.created_at)}
            </p>
          </div>
        ))}
      </div>
      <form action={formAction} className="mt-3 flex flex-col gap-2">
        <Textarea name="body" placeholder="Write a reply…" required rows={3} value={body} onChange={(e) => setBody(e.target.value)} />
        {/* Only once it is close to the limit — a counter over an empty box is
            noise, and finding out on submit that a long reply is too long is
            the version of this that loses the reply. */}
        {body.trim().length > TICKET_BODY_MAX - 500 && (
          <p className={`text-xs ${over ? "text-danger" : "text-muted"}`}>
            {body.trim().length.toLocaleString("en-US")} / {TICKET_BODY_MAX.toLocaleString("en-US")} characters
          </p>
        )}
        <Button type="submit" variant="primary" pending={pending} disabled={over} className="self-start">
          Reply
        </Button>
      </form>
      {state?.error && <p className="mt-1 text-xs text-danger">{state.error}</p>}
    </div>
  );
}
