"use client";

import { useState } from "react";
import { NewTrackerFieldForm } from "./TrackerFieldForm";

export function NewCountryForm() {
  const [code, setCode] = useState<string | null>(null);

  if (code) {
    return (
      <div className="mb-6 rounded-lg border border-border bg-card p-4">
        <h3 className="mb-3 text-sm font-medium text-ink">New tracker — {code}</h3>
        <NewTrackerFieldForm countryCode={code} />
        <p className="mt-2 text-xs text-muted">Add the first field above — the country will then appear as its own card below.</p>
      </div>
    );
  }

  return (
    <details className="mb-6 rounded-lg border border-border bg-card p-4">
      <summary className="cursor-pointer text-sm font-medium text-ink">+ Start a tracker for a new country</summary>
      <form
        className="mt-3 flex items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          const input = (e.currentTarget.elements.namedItem("country_code") as HTMLInputElement).value.trim().toUpperCase();
          if (input) setCode(input);
        }}
      >
        <input
          name="country_code"
          placeholder="Country code, e.g. CA"
          maxLength={4}
          required
          className="rounded-md border border-border bg-card px-2 py-1.5 text-sm uppercase"
        />
        <button type="submit" className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-ink">
          Continue
        </button>
      </form>
    </details>
  );
}
