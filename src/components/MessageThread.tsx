"use client";

import { useActionState } from "react";
import { sendMessage } from "@/lib/actions/messages";

export type MessageRow = {
  id: string;
  body: string;
  channel: string;
  direction: string;
  sent_at: string;
  sent_by: { full_name: string } | { full_name: string }[] | null;
};

function one<T>(v: T | T[] | null) {
  return Array.isArray(v) ? v[0] ?? null : v;
}

export function MessageThread({
  messages,
  entityType,
  entityId,
  channel,
  revalidateTo,
  placeholder = "Write a message…",
}: {
  messages: MessageRow[];
  entityType: "student" | "university";
  entityId: string;
  channel: string;
  revalidateTo: string;
  placeholder?: string;
}) {
  const action = sendMessage.bind(null, entityType, entityId, channel, revalidateTo);
  const [state, formAction, pending] = useActionState(action, undefined);

  return (
    <div>
      <div className="flex flex-col gap-3">
        {messages.length === 0 && <p className="text-sm text-muted">No messages yet.</p>}
        {messages.map((m) => (
          <div key={m.id} className={`max-w-[85%] rounded-lg px-3 py-2 text-sm ${m.direction === "outbound" ? "self-end bg-primary text-primary-ink" : "bg-bg text-ink"}`}>
            <p>{m.body}</p>
            <p className="mt-1 text-[10px] opacity-70">
              {one(m.sent_by)?.full_name ?? "System"} · {new Date(m.sent_at).toLocaleString()}
            </p>
          </div>
        ))}
      </div>
      <form action={formAction} className="mt-4 flex gap-2">
        <input name="body" placeholder={placeholder} required className="flex-1 rounded-md border border-border px-3 py-2 text-sm" />
        <button type="submit" disabled={pending} className="rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-ink disabled:opacity-50">
          Send
        </button>
      </form>
      {state?.error && <p className="mt-1 text-xs text-danger">{state.error}</p>}
    </div>
  );
}
