"use client";

import { useActionState, useState } from "react";
import { broadcastMessage } from "@/lib/actions/messages";
import type { TemplateRow } from "@/components/MessageThread";
import { Button } from "@/components/ui/Button";
import { Select, Textarea } from "@/components/ui/Input";
import { MESSAGE_MAX_LENGTH } from "@/lib/messages";
import { EmptyState } from "@/components/ui/EmptyState";

type Student = { id: string; full_name: string };

export function BroadcastForm({ students, templates }: { students: Student[]; templates: TemplateRow[] }) {
  const [state, formAction, pending] = useActionState(broadcastMessage, undefined);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [body, setBody] = useState("");

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <form action={formAction} className="flex flex-col gap-4">
      {selected.size > 0 &&
        [...selected].map((id) => <input key={id} type="hidden" name="student_ids" value={id} />)}

      <div>
        <div className="mb-2 flex items-center justify-between">
          <label className="text-sm font-medium text-ink">Recipients ({selected.size} selected)</label>
          <button
            type="button"
            onClick={() => setSelected(selected.size === students.length ? new Set() : new Set(students.map((s) => s.id)))}
            className="text-xs text-primary hover:underline"
          >
            {selected.size === students.length ? "Deselect all" : "Select all"}
          </button>
        </div>
        <div className="max-h-64 overflow-y-auto rounded-md border border-border">
          {students.map((s) => (
            <label key={s.id} className="flex items-center gap-2 border-b border-border px-3 py-2 text-sm last:border-0 hover:bg-bg">
              <input type="checkbox" checked={selected.has(s.id)} onChange={() => toggle(s.id)} />
              {s.full_name}
            </label>
          ))}
          {students.length === 0 && (
            <div className="px-3 py-4">
              <EmptyState>No students visible to you yet.</EmptyState>
            </div>
          )}
        </div>
      </div>

      {templates.length > 0 && (
        <Select
          className="text-xs"
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

      <Textarea
        name="body"
        placeholder="Message body…"
        required
        rows={4}
        maxLength={MESSAGE_MAX_LENGTH}
        value={body}
        onChange={(e) => setBody(e.target.value)}
      />
      {body.length > MESSAGE_MAX_LENGTH * 0.8 && (
        <p className="-mt-2 text-xs text-muted">
          {body.length.toLocaleString("en-US")} of {MESSAGE_MAX_LENGTH.toLocaleString("en-US")} characters
        </p>
      )}

      {state?.error && <p className="text-sm text-danger">{state.error}</p>}
      {state?.success && <p className="text-sm text-success">Sent to {state.count} student(s).</p>}
      {/* Confirmed before sending: this reaches many people at once from a
          single click, "Select all" is one button away, and there is no
          unsend. */}
      <Button
        type="submit"
        variant="primary"
        size="lg"
        disabled={selected.size === 0}
        pending={pending}
        className="self-start"
        onClick={(e) => {
          const names = students
            .filter((s) => selected.has(s.id))
            .map((s) => s.full_name)
            .slice(0, 5)
            .join(", ");
          const more = selected.size > 5 ? ` and ${selected.size - 5} more` : "";
          if (!confirm(`Send this message to ${selected.size} student(s) — ${names}${more}? They will see it in their portal straight away and it cannot be unsent.`)) {
            e.preventDefault();
          }
        }}
      >
        {`Send to ${selected.size} student(s)`}
      </Button>
    </form>
  );
}
