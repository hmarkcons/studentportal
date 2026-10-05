"use client";

import { useEffect, useRef, useState } from "react";
import { Input } from "@/components/ui/Input";
import { PKR_RATE_MAX, PKR_RATE_MIN, parsePkrRate, rateLooksOff } from "@/lib/receiptPkr";
import { formatDateOnly } from "@/lib/formatDate";

export type LatestPkrRate = { rate: number; setAt: string; setBy: string | null };

/**
 * Rupees per euro, given for this invoice or this payment (0318): the euro
 * moves daily, so whoever issues the invoice or records the money says what
 * it is today. Offered the latest one given, with when and by whom.
 *
 * Only for a euro invoice — a rupee invoice has nothing to convert. Given the
 * currency outright on a payment; on an invoice being raised, it follows the
 * form's own currency choice, and takes itself out of the form entirely
 * otherwise, so a hidden required field cannot stop the form submitting.
 */
export function PkrRateField({
  latest,
  currency,
  label = "PKR per €1",
  compact = false,
}: {
  latest: LatestPkrRate | null;
  /** The invoice's currency; omitted, it is read from the form's `currency` field. */
  currency?: string | null;
  label?: string;
  compact?: boolean;
}) {
  const anchor = useRef<HTMLSpanElement>(null);
  const [formCurrency, setFormCurrency] = useState<string | null>(null);
  const [value, setValue] = useState(latest ? String(latest.rate) : "");

  // Follows the currency picked on the same form, when it has one.
  useEffect(() => {
    if (currency !== undefined) return;
    const form = anchor.current?.closest("form");
    const field = form?.elements.namedItem("currency");
    if (!(field instanceof HTMLSelectElement || field instanceof HTMLInputElement)) return;
    const read = () => setFormCurrency(field.value);
    read();
    field.addEventListener("change", read);
    return () => field.removeEventListener("change", read);
  }, [currency]);

  const effective = currency !== undefined ? currency : formCurrency;
  const shown = effective === "EUR";
  const rate = parsePkrRate(value);
  const off = rateLooksOff(rate, latest?.rate);

  return (
    <span ref={anchor} className={shown ? "contents" : "hidden"} data-pkr-rate-field={shown || undefined}>
      {shown && (
        <label className="flex flex-col gap-0.5 text-xs text-muted">
          {label}
          <Input
            name="pkr_per_eur"
            type="number"
            inputMode="decimal"
            step="0.01"
            min={PKR_RATE_MIN}
            max={PKR_RATE_MAX}
            required
            value={value}
            onChange={(e) => setValue(e.target.value)}
            className={compact ? "w-24" : "w-28"}
          />
          {latest && !compact && (
            <span className="text-[10px]" data-pkr-rate-latest>
              Latest {latest.rate}
              {latest.setAt ? ` · ${formatDateOnly(latest.setAt.slice(0, 10))}` : ""}
              {latest.setBy ? ` · ${latest.setBy}` : ""}
            </span>
          )}
          {off && (
            <span className="text-[10px] text-warning" data-pkr-rate-warning>
              Far from the latest ({latest?.rate}) — check it.
            </span>
          )}
        </label>
      )}
    </span>
  );
}
