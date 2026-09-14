"use client";

import { useActionState, useState } from "react";
import { importDestinations } from "@/lib/actions/destinations";
import { SampleCsvButton } from "@/components/ui/SampleCsvButton";
import { Button } from "@/components/ui/Button";
import { FileField } from "@/components/FileField";

const HEADERS = ["country", "country_code", "track", "currency", "display_name", "visa_type", "admin_charge", "consultancy_fee", "consultancy_fee_currency"];
const EXAMPLE = ["Italy", "IT", "public", "EUR", "Italy (Public)", "National visa", "100", "500", "EUR"];

export function ImportDestinationsForm() {
  const [state, formAction, pending] = useActionState(importDestinations, undefined);
  const [ready, setReady] = useState(false);

  return (
    <details className="mt-3 rounded-md border border-border p-3">
      <summary className="cursor-pointer text-sm font-medium text-ink">Import destinations from CSV</summary>
      <form action={formAction} className="mt-3 flex flex-wrap items-end gap-2">
        <FileField accept=".csv" required hint="CSV" inputClassName="text-sm" onChange={(s) => setReady(Boolean(s.file))} />
        <Button type="submit" variant="primary" disabled={pending || !ready}>
          {pending ? "Importing…" : "Import"}
        </Button>
        <SampleCsvButton filename="destinations-sample.csv" headers={HEADERS} exampleRow={EXAMPLE} />
      </form>
      <p className="mt-2 text-xs text-muted">
        CSV columns: <code>country</code>, <code>country_code</code>, <code>track</code> (public/private), <code>currency</code>{" "}
        (all required), plus optional <code>display_name</code>, <code>visa_type</code>, <code>admin_charge</code>,{" "}
        <code>consultancy_fee</code>, <code>consultancy_fee_currency</code>.
      </p>
      {state?.error && <p className="mt-2 text-xs text-danger">{state.error}</p>}
      {state?.success && (
        <p className="mt-2 text-xs text-success">
          Imported {state.count} destinations.{state.skipped ? ` Skipped ${state.skipped} already existing (same country + track).` : ""}
        </p>
      )}
    </details>
  );
}
