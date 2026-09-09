"use client";

import { useActionState, useState } from "react";
import { saveTestScores } from "@/lib/actions/studentProfileExtras";
import { Button } from "@/components/ui/Button";
import { Input, Select } from "@/components/ui/Input";
import { TEST_TYPES, TEST_TYPE_LABELS, needsCustomName } from "@/lib/testScores";



export type TestScoreRow = {
  id: string;
  test_type: string;
  score: string | null;
  test_date: string | null;
  custom_test_name?: string | null;
};

type DraftRow = { key: string; id: string; test_type: string; score: string; test_date: string; custom_test_name: string };

function toDraft(rows: TestScoreRow[]): DraftRow[] {
  return rows.map((r) => ({
    key: r.id,
    id: r.id,
    test_type: r.test_type,
    score: r.score ?? "",
    test_date: r.test_date ?? "",
    custom_test_name: r.custom_test_name ?? "",
  }));
}

// Edited as a table and committed with one Save, rather than a row at a time:
// a mistyped band score used to mean deleting the row and retyping it, and a
// score corrected on a re-sit is the ordinary case, not the rare one.
export function TestScoresSection({ studentId, revalidateTo, scores }: { studentId: string; revalidateTo: string; scores: TestScoreRow[] }) {
  const action = saveTestScores.bind(null, studentId, revalidateTo);
  const [state, formAction, pending] = useActionState(action, undefined);
  const [rows, setRows] = useState<DraftRow[]>(() => toDraft(scores));

  function update(key: string, patch: Partial<DraftRow>) {
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  }

  return (
    <form action={formAction} className="flex flex-col gap-3">
      {rows.length === 0 && <p className="text-xs text-muted">No test scores on file yet.</p>}

      {rows.map((r) => (
        <div key={r.key} className="flex flex-wrap items-end gap-2 rounded-md border border-border p-2">
          <input type="hidden" name="score_id" value={r.id} />
          <label className="flex flex-col gap-1 text-xs text-muted">
            Test
            <Select name="score_type" value={r.test_type} onChange={(e) => update(r.key, { test_type: e.target.value })} className="w-32">
              {TEST_TYPES.map((value) => (
                <option key={value} value={value}>
                  {TEST_TYPE_LABELS[value]}
                </option>
              ))}
            </Select>
          </label>
          {/* "Other — scorecard" tells nobody which document to chase, and the
              document requirement this row generates is named from it, so the
              real name is asked for as soon as Other is picked. A hidden field
              keeps the form arrays aligned for the rows that don't need it. */}
          {needsCustomName(r.test_type) ? (
            <label className="flex flex-col gap-1 text-xs text-muted">
              Test name
              <Input
                name="score_custom_name"
                value={r.custom_test_name}
                onChange={(e) => update(r.key, { custom_test_name: e.target.value })}
                placeholder="e.g. NTS GAT"
                required
                className="w-36"
              />
            </label>
          ) : (
            <input type="hidden" name="score_custom_name" value="" />
          )}
          <label className="flex flex-col gap-1 text-xs text-muted">
            Score
            <Input name="score_value" value={r.score} onChange={(e) => update(r.key, { score: e.target.value })} placeholder="e.g. 7.5" className="w-24" />
          </label>
          <label className="flex flex-col gap-1 text-xs text-muted">
            Test date
            <Input name="score_date" type="date" value={r.test_date} onChange={(e) => update(r.key, { test_date: e.target.value })} />
          </label>
          <button
            type="button"
            onClick={() => setRows((prev) => prev.filter((x) => x.key !== r.key))}
            className="pb-2 text-xs text-danger hover:underline"
          >
            🗑️ Remove
          </button>
        </div>
      ))}

      <div>
        <button
          type="button"
          onClick={() =>
            setRows((prev) => [
              ...prev,
              { key: crypto.randomUUID(), id: "", test_type: "ielts", score: "", test_date: "", custom_test_name: "" },
            ])
          }
          className="text-xs font-medium text-primary hover:underline"
        >
          + Add score
        </button>
      </div>

      {state?.error && <p className="text-xs text-danger">{state.error}</p>}
      {state?.success && <p className="text-xs text-success">Saved.</p>}
      <div>
        {/* Removals only reach the database on Save, so a row deleted by
            accident is undone by leaving the page. */}
        <Button type="submit" variant="primary" size="sm" pending={pending}>
          Save test scores
        </Button>
      </div>
    </form>
  );
}
