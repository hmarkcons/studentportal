"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { sendMessage } from "@/lib/actions/messages";
import { Button } from "@/components/ui/Button";
import { Select, Textarea } from "@/components/ui/Input";
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

// Pinned locale and a readable shape. This renders on the server and hydrates
// on the client, so an implicit locale is a hydration mismatch (see
// formatDate.ts), and a bare toLocaleString gave "9/9/2026, 2:32:07 PM".
function stamp(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString("en-US", { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" });
}

export function MessageThread({
  messages,
  entityType,
  entityId,
  channel,
  revalidateTo,
  placeholder = "Write a message…",
  templates,
  ownDirection = "outbound",
  counterpartName,
}: {
  messages: MessageRow[];
  entityType: "student" | "university";
  entityId: string;
  channel: string;
  revalidateTo: string;
  placeholder?: string;
  templates?: TemplateRow[];
  /**
   * Which stored direction belongs to whoever is looking. sendMessage writes
   * "outbound" for staff and "inbound" for a student, so the student portal
   * must pass "inbound" — otherwise every student saw the conversation
   * mirrored, their counsellor's messages sitting where their own should be.
   */
  ownDirection?: "outbound" | "inbound";
  /** Who the other side is, for attributing messages that carry no staff sender. */
  counterpartName?: string;
}) {
  const action = sendMessage.bind(null, entityType, entityId, channel, revalidateTo);
  const [state, formAction, pending] = useActionState(action, undefined);
  const [body, setBody] = useState("");
  const wasPending = useRef(false);
  const formRef = useRef<HTMLFormElement | null>(null);

  useEffect(() => {
    if (wasPending.current && !pending && !state?.error) setBody("");
    wasPending.current = pending;
  }, [pending, state]);

  return (
    <div>
      <div className="flex flex-col gap-3">
        {messages.length === 0 && <EmptyState>No messages yet.</EmptyState>}
        {messages.map((m) => {
          const mine = m.direction === ownDirection;
          const sender = one(m.sent_by)?.full_name;
          // A student's own message has no staff sender, so sent_by is null.
          // That used to render as "System", which reads like the software
          // talking rather than the person in the conversation.
          const who = mine ? "You" : sender ?? counterpartName ?? "System";
          return (
            <div
              key={m.id}
              className={`max-w-[85%] rounded-lg px-3 py-2 text-sm ${
                mine ? "self-end bg-primary text-primary-ink" : "bg-bg text-ink"
              }`}
            >
              <p className="whitespace-pre-wrap break-words">{m.body}</p>
              <p className="mt-1 text-[10px] opacity-70">
                {who} · {stamp(m.sent_at)}
              </p>
            </div>
          );
        })}
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
      <form ref={formRef} action={formAction} className="mt-2 flex items-end gap-2">
        {/* Textarea, not a single-line input: messages to a counsellor run to
            more than one line, and a template dropped into a one-line box
            scrolled sideways. Enter sends, Shift+Enter breaks the line. */}
        <Textarea
          name="body"
          placeholder={placeholder}
          required
          rows={2}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              if (body.trim()) formRef.current?.requestSubmit();
            }
          }}
          className="flex-1"
        />
        <Button type="submit" variant="primary" pending={pending}>
          Send
        </Button>
      </form>
      {state?.error && <p className="mt-1 text-xs text-danger">{state.error}</p>}
    </div>
  );
}
