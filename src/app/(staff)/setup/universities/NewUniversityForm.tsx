"use client";

import { useActionState, useState } from "react";
import { createUniversity } from "@/lib/actions/universities";
import { Button } from "@/components/ui/Button";
import { Input, Select } from "@/components/ui/Input";
import { FEE_CURRENCIES } from "@/lib/applicationFee";

export type NewUniversityDestination = { id: string; display_name: string; currency: string | null; track: string | null };
export type NewUniversityBody = { id: string; name: string; region: string | null; destinationIds: string[] };

/**
 * Adding a university with everything the catalogue records about it at that
 * level — the application fee and the DSU body included, which used to wait
 * for the edit page after it was created.
 *
 * The destination comes first because the rest follows it: the fee's currency
 * and the track default to the country's own, and the DSU body can only be one
 * of the bodies that serve that country (Setup → Scholarship bodies).
 */
export function NewUniversityForm({ destinations, bodies }: { destinations: NewUniversityDestination[]; bodies: NewUniversityBody[] }) {
  const [state, formAction, pending] = useActionState(createUniversity, undefined);
  const [destinationId, setDestinationId] = useState("");
  // Empty until somebody picks one themselves; until then both follow the
  // destination, so changing the destination changes them too.
  const [type, setType] = useState("");
  const [currency, setCurrency] = useState("");
  const [dsuBodyId, setDsuBodyId] = useState("");

  const destination = destinations.find((d) => d.id === destinationId) ?? null;
  const shownType = type || (destination?.track === "private" ? "private" : "public");
  const shownCurrency = currency || destination?.currency || "EUR";
  const currencies = (FEE_CURRENCIES as readonly string[]).includes(shownCurrency) ? FEE_CURRENCIES : [shownCurrency, ...FEE_CURRENCIES];
  const countryBodies = bodies
    .filter((b) => destinationId && b.destinationIds.includes(destinationId))
    .sort((a, b) => (a.region ?? "").localeCompare(b.region ?? "") || a.name.localeCompare(b.name));

  return (
    <form action={formAction} className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
      <label className="flex flex-col gap-1 text-xs text-muted">
        <span>
          Destination <span className="text-danger">*</span>
        </span>
        <Select
          name="destination_id"
          required
          value={destinationId}
          onChange={(e) => {
            setDestinationId(e.target.value);
            // A body from the previous country would be refused on save.
            setDsuBodyId("");
          }}
        >
          <option value="">Choose…</option>
          {destinations.map((d) => (
            <option key={d.id} value={d.id}>
              {d.display_name}
            </option>
          ))}
        </Select>
      </label>
      <label className="flex flex-col gap-1 text-xs text-muted lg:col-span-2">
        <span>
          University name <span className="text-danger">*</span>
        </span>
        <Input name="name" required placeholder="e.g. Università di Pavia" />
      </label>

      <label className="flex flex-col gap-1 text-xs text-muted">
        <span>
          City <span className="text-danger">*</span>
        </span>
        <Input name="city" required placeholder="e.g. Pavia" />
      </label>
      <label className="flex flex-col gap-1 text-xs text-muted">
        Region / state
        <Input name="region" placeholder="e.g. Lombardy" />
      </label>
      <label className="flex flex-col gap-1 text-xs text-muted">
        Type
        <Select name="type" value={shownType} onChange={(e) => setType(e.target.value)} required>
          <option value="public">Public</option>
          <option value="private">Private</option>
        </Select>
      </label>

      <label className="flex flex-col gap-1 text-xs text-muted">
        University email
        <Input name="contact_email" type="email" placeholder="admissions@…" />
      </label>
      <div className="flex flex-col gap-1 text-xs text-muted">
        <span>Application fee</span>
        <span className="flex items-center gap-1">
          <Input name="application_fee" type="number" step="0.01" min="0" placeholder="None" aria-label="Application fee" className="min-w-0 flex-1" />
          <Select
            name="application_fee_currency"
            value={shownCurrency}
            onChange={(e) => setCurrency(e.target.value)}
            aria-label="Application fee currency"
            className="shrink-0"
            style={{ width: "5.5rem" }}
          >
            {currencies.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </Select>
        </span>
        <span className="text-[11px]">For every programme here, unless a programme has its own.</span>
      </div>
      <label className="flex flex-col gap-1 text-xs text-muted">
        DSU body
        <Select name="dsu_body_id" value={dsuBodyId} onChange={(e) => setDsuBodyId(e.target.value)}>
          <option value="">
            {!destinationId ? "Choose the destination first" : countryBodies.length === 0 ? "No scholarship body serves this country" : "None chosen"}
          </option>
          {countryBodies.map((b) => (
            <option key={b.id} value={b.id}>
              {b.region ? `${b.name} — ${b.region}` : b.name}
            </option>
          ))}
        </Select>
        <span className="text-[11px]">A region can have several — pick the one that pays this university&rsquo;s students.</span>
      </label>

      <div className="flex flex-wrap items-center gap-2 sm:col-span-2 lg:col-span-3">
        <Button type="submit" variant="primary" pending={pending} status={{ state, label: "University added." }}>
          Add university
        </Button>
        <span className="text-[11px] text-muted">Its programmes are added on the university&rsquo;s page, each with its own fee if it differs.</span>
        {state?.error && <p className="w-full text-sm text-danger">{state.error}</p>}
      </div>
    </form>
  );
}
