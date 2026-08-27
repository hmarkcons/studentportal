"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { sendMessage } from "@/lib/actions/messages";
import { Button } from "@/components/ui/Button";
import { Input, Select } from "@/components/ui/Input";
import { EmptyState } from "@/components/ui/EmptyState";

export type TemplateRow = { id: string; purpose: string; channel: string; body: string };

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
  templates,
}: {
  messages: MessageRow[];
  entityType: "student" | "university";
  entityId: string;
  channel: string;
  revalidateTo: string;
  placeholder?: string;
  templates?: TemplateRow[];
}) {
  const action = sendMessage.bind(null, entityType, entityId, channel, revalidateTo);
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
        {messages.length === 0 && <EmptyState>No messages yet.</EmptyState>}
        {messages.map((m) => (
          <div key={m.id} className={`max-w-[85%] rounded-lg px-3 py-2 text-sm ${m.direction === "outbound" ? "self-end bg-primary text-primary-ink" : "bg-bg text-ink"}`}>
            <p>{m.body}</p>
            <p className="mt-1 text-[10px] opacity-70">
              {one(m.sent_by)?.full_name ?? "System"} · {new Date(m.sent_at).toLocaleString()}
            </p>
          </div>
        ))}
      </div>
      {templates && templates.length > 0 && (
        <Select
          className="mt-3 text-xs"
          defaultValue=""
          onChange={(e) => {
            const t = templates.find((t) => t.id === e.target.value);
            if (t) setBody(t.body);
          }}
        >
          <option value="">Use a template…</option>
          {templates.map((t) => (
            <option key={t.id} value={t.id}>
              {t.purpose} ({t.channel})
            </option>
          ))}
        </Select>
      )}
      <form action={formAction} className="mt-2 flex gap-2">
        <Input name="body" placeholder={placeholder} required value={body} onChange={(e) => setBody(e.target.value)} className="flex-1" />
        <Button type="submit" variant="primary" pending={pending}>
          Send
        </Button>
      </form>
      {state?.error && <p className="mt-1 text-xs text-danger">{state.error}</p>}
    </div>
  );
}
