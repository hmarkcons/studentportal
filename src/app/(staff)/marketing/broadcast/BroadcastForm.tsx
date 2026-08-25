"use client";

import { useActionState, useState } from "react";
import { broadcastMessage } from "@/lib/actions/messages";
import type { TemplateRow } from "@/components/MessageThread";

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
          {students.length === 0 && <p className="px-3 py-4 text-sm text-muted">No students visible to you yet.</p>}
        </div>
      </div>

      {templates.length > 0 && (
        <select
          className="rounded-md border border-border px-2 py-1.5 text-xs"
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
        </select>
      )}

      <textarea
        name="body"
        placeholder="Message body…"
        required
        rows={4}
        value={body}
        onChange={(e) => setBody(e.target.value)}
        className="rounded-md border border-border px-3 py-2 text-sm"
      />

      {state?.error && <p className="text-sm text-danger">{state.error}</p>}
      {state?.success && <p className="text-sm text-success">Sent to {state.count} student(s).</p>}
      <button
        type="submit"
        disabled={pending || selected.size === 0}
        className="self-start rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-ink disabled:opacity-50"
      >
        {pending ? "Sending…" : `Send to ${selected.size} student(s)`}
      </button>
    </form>
  );
}
