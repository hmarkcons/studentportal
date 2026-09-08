"use client";

import { useActionState, useState } from "react";
import { createFaq, updateFaq, deleteFaq, moveFaq } from "@/lib/actions/supportFaqs";
import { Button } from "@/components/ui/Button";
import { Input, Textarea } from "@/components/ui/Input";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";

export type FaqRow = {
  id: string;
  question: string;
  answer: string;
  sort_order: number;
  is_published: boolean;
};

export function FaqEditor({ faqs }: { faqs: FaqRow[] }) {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        {faqs.length === 0 && <EmptyState>No FAQ entries yet. Add the first one below.</EmptyState>}
        {faqs.map((f, i) => (
          <FaqRowEditor key={f.id} faq={f} isFirst={i === 0} isLast={i === faqs.length - 1} />
        ))}
      </div>

      <div className="rounded-md border border-border p-4">
        <h3 className="mb-3 text-sm font-medium text-ink">Add an entry</h3>
        <NewFaqForm />
      </div>
    </div>
  );
}

function NewFaqForm() {
  const [state, formAction, pending] = useActionState(createFaq, undefined);

  return (
    <form action={formAction} className="flex flex-col gap-2">
      <Input name="question" placeholder="Question a student would actually ask" required />
      <Textarea name="answer" placeholder="Answer, in plain language" rows={3} required />
      <label className="flex items-center gap-2 text-xs text-ink">
        <input type="checkbox" name="is_published" defaultChecked />
        Show this to students
      </label>
      {state?.error && <p className="text-xs text-danger">{state.error}</p>}
      {state?.success && <p className="text-xs text-success">Added.</p>}
      <Button type="submit" variant="primary" size="sm" pending={pending} className="self-start">
        Add entry
      </Button>
    </form>
  );
}

function FaqRowEditor({ faq, isFirst, isLast }: { faq: FaqRow; isFirst: boolean; isLast: boolean }) {
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const action = updateFaq.bind(null, faq.id);
  const [state, formAction, pending] = useActionState(action, undefined);

  async function run(fn: () => Promise<{ error?: string } | void>) {
    setBusy(true);
    setError(null);
    const result = await fn();
    if (result && "error" in result && result.error) setError(result.error);
    setBusy(false);
  }

  if (editing) {
    return (
      <form action={formAction} className="flex flex-col gap-2 rounded-md border border-border p-4">
        <Input name="question" defaultValue={faq.question} required />
        <Textarea name="answer" defaultValue={faq.answer} rows={3} required />
        <label className="flex items-center gap-2 text-xs text-ink">
          <input type="checkbox" name="is_published" defaultChecked={faq.is_published} />
          Show this to students
        </label>
        {state?.error && <p className="text-xs text-danger">{state.error}</p>}
        {state?.success && <p className="text-xs text-success">Saved.</p>}
        <div className="flex flex-wrap items-center gap-2">
          <Button type="submit" variant="primary" size="sm" pending={pending}>
            Save
          </Button>
          <Button type="button" variant="ghost" size="sm" onClick={() => setEditing(false)}>
            {state?.success ? "Close" : "Cancel"}
          </Button>
        </div>
      </form>
    );
  }

  return (
    <div className="rounded-md border border-border p-4">
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <div className="min-w-0">
          <p className="flex flex-wrap items-center gap-2 text-sm font-medium text-ink">
            {faq.question}
            {/* An unpublished entry is a draft or a retired answer, so say so —
                otherwise staff wonder why students cannot see it. */}
            {!faq.is_published && <Badge tone="neutral">Hidden from students</Badge>}
          </p>
          <p className="mt-1 whitespace-pre-wrap text-sm text-muted">{faq.answer}</p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-1">
          <button
            type="button"
            disabled={isFirst || busy}
            onClick={() => run(() => moveFaq(faq.id, "up"))}
            className="rounded-md border border-border px-2 py-1 text-xs text-ink hover:bg-bg disabled:opacity-40"
            aria-label="Move up"
          >
            ↑
          </button>
          <button
            type="button"
            disabled={isLast || busy}
            onClick={() => run(() => moveFaq(faq.id, "down"))}
            className="rounded-md border border-border px-2 py-1 text-xs text-ink hover:bg-bg disabled:opacity-40"
            aria-label="Move down"
          >
            ↓
          </button>
          <Button type="button" size="sm" onClick={() => setEditing(true)}>
            ✏️ Edit
          </Button>
          <Button
            type="button"
            variant="danger"
            size="sm"
            pending={busy}
            onClick={() => {
              if (!confirm(`Delete "${faq.question}"? Students will no longer see it.`)) return;
              void run(() => deleteFaq(faq.id));
            }}
          >
            🗑️
          </Button>
        </div>
      </div>
      {error && <p className="mt-2 text-xs text-danger">{error}</p>}
    </div>
  );
}
