"use client";

import { useState, useTransition } from "react";
import { CalendarDays, Pencil } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { AGREEMENT_DATE_MAX, AGREEMENT_DATE_MIN, agreementDateShort } from "@/lib/agreementDate";

type SaveResult = { success?: true; message?: string; error?: string };

/**
 * The date printed on an agreement (0310), with a pencil to change it for
 * whoever may. Changing it rebuilds the generated PDF; the server says what it
 * did, which is shown beside it.
 */
export function AgreementDateEditor({
  date,
  canEdit,
  save,
}: {
  /** YYYY-MM-DD. */
  date: string;
  canEdit: boolean;
  save: (date: string) => Promise<SaveResult>;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(date);
  const [shown, setShown] = useState(date);
  const [result, setResult] = useState<SaveResult | null>(null);
  const [saving, startSaving] = useTransition();

  if (!editing) {
    return (
      <span className="inline-flex flex-wrap items-center gap-1" data-agreement-date={shown}>
        <CalendarDays aria-hidden className="h-3.5 w-3.5 text-muted" />
        <span title="The date printed on the agreement">Dated {agreementDateShort(shown)}</span>
        {canEdit && (
          <button
            type="button"
            onClick={() => {
              setValue(shown);
              setResult(null);
              setEditing(true);
            }}
            className="rounded p-0.5 text-muted hover:bg-bg hover:text-ink"
            aria-label="Change the agreement date"
            title="Change the date printed on the agreement"
            data-agreement-date-edit
          >
            <Pencil aria-hidden className="h-3.5 w-3.5" />
          </button>
        )}
        {result && (
          <span className={result.error ? "text-danger" : "text-success"} role={result.error ? "alert" : "status"} data-agreement-date-result>
            {result.error ?? result.message}
          </span>
        )}
      </span>
    );
  }

  return (
    <form
      className="inline-flex flex-wrap items-center gap-1"
      onSubmit={(e) => {
        e.preventDefault();
        startSaving(async () => {
          const r = await save(value);
          setResult(r);
          if (!r.error) {
            setShown(value);
            setEditing(false);
          }
        });
      }}
      data-agreement-date-form
    >
      <Input
        type="date"
        name="agreement_date"
        value={value}
        min={AGREEMENT_DATE_MIN}
        max={AGREEMENT_DATE_MAX}
        required
        onChange={(e) => setValue(e.target.value)}
        className="h-7 w-40 py-0 text-xs"
        aria-label="Agreement date"
      />
      <Button type="submit" size="sm" variant="primary" pending={saving}>
        Save date
      </Button>
      <Button type="button" size="sm" variant="ghost" onClick={() => setEditing(false)}>
        Cancel
      </Button>
      {result?.error && (
        <span className="text-danger" role="alert">
          {result.error}
        </span>
      )}
    </form>
  );
}
