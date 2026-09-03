"use client";

import { useActionState, useState } from "react";
import { addTestScore, deleteTestScore } from "@/lib/actions/studentProfileExtras";
import { Button } from "@/components/ui/Button";
import { Input, Select } from "@/components/ui/Input";

const TEST_TYPE_LABELS: Record<string, string> = {
  ielts: "IELTS",
  toefl: "TOEFL",
  pte: "PTE",
  duolingo: "Duolingo",
  langcert: "LangCert",
  ib: "IB",
  moi: "MOI",
  gre: "GRE",
  sat: "SAT",
  other: "Other",
};

export type TestScoreRow = { id: string; test_type: string; score: string | null; test_date: string | null };

function AddTestScoreForm({ studentId, revalidateTo }: { studentId: string; revalidateTo: string }) {
  const action = addTestScore.bind(null, studentId, revalidateTo);
  const [state, formAction, pending] = useActionState(action, undefined);

  return (
    <form action={formAction} className="flex flex-wrap items-end gap-2">
      <label className="flex flex-col gap-1 text-xs text-muted">
        Test
        <Select name="test_type" defaultValue="ielts" className="w-32">
          {Object.entries(TEST_TYPE_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </Select>
      </label>
      <label className="flex flex-col gap-1 text-xs text-muted">
        Score
        <Input name="score" placeholder="e.g. 7.5" className="w-24" />
      </label>
      <label className="flex flex-col gap-1 text-xs text-muted">
        Test date
        <Input name="test_date" type="date" />
      </label>
      <Button type="submit" variant="outline-primary" size="sm" pending={pending}>
        + Add score
      </Button>
      {state?.error && <p className="w-full text-xs text-danger">{state.error}</p>}
    </form>
  );
}

function DeleteScoreButton({ id, revalidateTo }: { id: string; revalidateTo: string }) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleDelete() {
    setPending(true);
    setError(null);
    const result = await deleteTestScore(id, revalidateTo);
    if (result?.error) setError(result.error);
    setPending(false);
  }

  return (
    <div className="flex items-center gap-1">
      <button type="button" onClick={handleDelete} disabled={pending} className="text-xs text-danger hover:underline disabled:opacity-50">
        🗑️ Remove
      </button>
      {error && <span className="text-xs text-danger">{error}</span>}
    </div>
  );
}

export function TestScoresSection({ studentId, revalidateTo, scores }: { studentId: string; revalidateTo: string; scores: TestScoreRow[] }) {
  return (
    <div className="flex flex-col gap-3">
      {scores.length > 0 && (
        <div className="flex flex-col divide-y divide-border rounded-md border border-border">
          {scores.map((s) => (
            <div key={s.id} className="flex items-center justify-between px-3 py-2 text-sm">
              <span className="text-ink">
                {TEST_TYPE_LABELS[s.test_type] ?? s.test_type} — <span className="font-medium">{s.score ?? "—"}</span>
                {s.test_date && <span className="ml-2 text-xs text-muted">{s.test_date}</span>}
              </span>
              <DeleteScoreButton id={s.id} revalidateTo={revalidateTo} />
            </div>
          ))}
        </div>
      )}
      {scores.length === 0 && <p className="text-xs text-muted">No test scores on file yet.</p>}
      <AddTestScoreForm studentId={studentId} revalidateTo={revalidateTo} />
    </div>
  );
}
