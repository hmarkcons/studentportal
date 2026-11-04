"use client";

import { useState } from "react";
import { Input, Select } from "@/components/ui/Input";
import {
  FAMILY_KIND_LABELS,
  MAX_CHILDREN,
  MAX_SPOUSES,
  STANDARD_CHILD_FEE,
  STANDARD_SPOUSE_FEE,
  familyKindOf,
  type FamilyKind,
} from "@/lib/accompanyingFamily";

type FamilyDestination = {
  id: string;
  display_name: string;
  allows_dependants?: boolean | null;
  spouse_fee?: number | null;
  child_fee?: number | null;
  consultancy_fee_currency?: string | null;
};

const SYMBOLS: Record<string, string> = { EUR: "€", PKR: "PKR ", USD: "$" };
const money = (currency: string, n: number) => `${SYMBOLS[currency] ?? `${currency} `}${n.toLocaleString("en-US", { maximumFractionDigits: 2 })}`;

/**
 * Who is accompanying the student — a spouse, a spouse and children, or
 * children only — and how many, with the consultancy fee for each (0350).
 *
 * Shown only while a country that allows family is among the student's
 * countries (Setup › Destinations › Accompanying family). Hidden, the form
 * posts no family fields and the server leaves what is on file alone. The
 * fees start from that country's standard and can be changed for this one
 * student; the agreement adds them to the consultancy fee, spread over the
 * instalments.
 */
export function FamilyFields({
  destinations,
  selectedIds,
  initial,
}: {
  destinations: FamilyDestination[];
  /** The countries chosen on the form, primary first. */
  selectedIds: string[];
  initial?: { spouses?: number | null; children?: number | null; spouseFee?: number | null; childFee?: number | null } | null;
}) {
  const country = selectedIds.map((id) => destinations.find((d) => d.id === id)).find((d) => d?.allows_dependants) ?? null;
  const [kind, setKind] = useState<FamilyKind>(familyKindOf(initial?.spouses ?? 0, initial?.children ?? 0));
  const [spouses, setSpouses] = useState(String(Math.max(1, initial?.spouses ?? 1)));
  const [children, setChildren] = useState(String(Math.max(1, initial?.children ?? 1)));
  const [spouseFee, setSpouseFee] = useState(initial?.spouseFee != null ? String(initial.spouseFee) : "");
  const [childFee, setChildFee] = useState(initial?.childFee != null ? String(initial.childFee) : "");
  if (!country) return null;

  const currency = country.consultancy_fee_currency ?? "EUR";
  const standardSpouse = country.spouse_fee ?? STANDARD_SPOUSE_FEE;
  const standardChild = country.child_fee ?? STANDARD_CHILD_FEE;
  const wantsSpouse = kind === "spouse" || kind === "spouse_children";
  const wantsChildren = kind === "children" || kind === "spouse_children";
  const sCount = wantsSpouse ? Number(spouses) || 0 : 0;
  const cCount = wantsChildren ? Number(children) || 0 : 0;
  const sFee = spouseFee === "" ? standardSpouse : Number(spouseFee) || 0;
  const cFee = childFee === "" ? standardChild : Number(childFee) || 0;
  const total = sCount * sFee + cCount * cFee;

  return (
    <fieldset className="flex flex-col gap-3 rounded-lg border border-border p-3" data-family-fields>
      <legend className="px-1 text-sm font-medium text-ink">Accompanying family — {country.display_name}</legend>
      <label className="flex flex-col gap-1.5 text-sm font-medium text-ink">
        Who is coming with the student
        <Select name="family_kind" value={kind} onChange={(e) => setKind(e.target.value as FamilyKind)}>
          {(Object.keys(FAMILY_KIND_LABELS) as FamilyKind[]).map((k) => (
            <option key={k} value={k}>
              {FAMILY_KIND_LABELS[k]}
            </option>
          ))}
        </Select>
      </label>
      {wantsSpouse && (
        <div className="grid grid-cols-2 gap-3">
          <label className="flex flex-col gap-1.5 text-sm font-medium text-ink">
            Number of spouses
            <Input name="spouse_count" type="number" min={1} max={MAX_SPOUSES} step={1} value={spouses} onChange={(e) => setSpouses(e.target.value)} required />
          </label>
          <label className="flex flex-col gap-1.5 text-sm font-medium text-ink">
            Fee per spouse ({currency})
            <Input name="spouse_fee" type="number" min={0} step="0.01" value={spouseFee} placeholder={String(standardSpouse)} onChange={(e) => setSpouseFee(e.target.value)} />
          </label>
        </div>
      )}
      {wantsChildren && (
        <div className="grid grid-cols-2 gap-3">
          <label className="flex flex-col gap-1.5 text-sm font-medium text-ink">
            Number of children
            <Input name="children_count" type="number" min={1} max={MAX_CHILDREN} step={1} value={children} onChange={(e) => setChildren(e.target.value)} required />
          </label>
          <label className="flex flex-col gap-1.5 text-sm font-medium text-ink">
            Fee per child ({currency})
            <Input name="child_fee" type="number" min={0} step="0.01" value={childFee} placeholder={String(standardChild)} onChange={(e) => setChildFee(e.target.value)} />
          </label>
        </div>
      )}
      {kind !== "none" && (
        <p className="text-xs text-muted" data-family-total={total}>
          Family consultancy fee:{" "}
          {[sCount ? `${sCount} × ${money(currency, sFee)}` : null, cCount ? `${cCount} × ${money(currency, cFee)}` : null].filter(Boolean).join(" + ")} ={" "}
          <span className="font-semibold text-ink">{money(currency, total)}</span>. It is added to the consultancy fee on the agreement, spread over the
          instalments. A fee left blank is the country&rsquo;s standard.
        </p>
      )}
    </fieldset>
  );
}
