import { Input, Select } from "@/components/ui/Input";
import { FEE_CURRENCIES, FEE_TEXT_MAX } from "@/lib/applicationFee";

/**
 * An application fee: an amount or words, and the currency an amount is
 * charged in, posted as application_fee and application_fee_currency.
 *
 * Text, not a number field (0303): "30" is shown as €30 in the currency
 * picked; "Free for EU students" or "€30 (EU) / €50 (non-EU)" is shown exactly
 * as typed, and the currency then says nothing.
 *
 * `currency` is what the picker starts on — the saved one, or else whatever
 * the fee would be in (the university's, the country's). A saved currency the
 * list does not carry is still offered, so saving never quietly changes it.
 *
 * The picker's width is set inline: Input and Select both carry w-full, which
 * a width class beside it does not reliably beat, and the picker then took the
 * whole row and left the amount no room at all.
 */
export function FeeInput({
  amount,
  currency,
  compact = false,
}: {
  amount: number | string | null;
  currency: string;
  compact?: boolean;
}) {
  const options = (FEE_CURRENCIES as readonly string[]).includes(currency) ? FEE_CURRENCIES : [currency, ...FEE_CURRENCIES];
  return (
    <span className="flex w-full items-center gap-1">
      <Input
        name="application_fee"
        type="text"
        maxLength={FEE_TEXT_MAX}
        defaultValue={amount ?? ""}
        // On a programme, blank means the university's fee — and the inline
        // programme forms have no labels, so the placeholder has to say so.
        placeholder={compact ? "Application fee — blank charges the university's" : "e.g. 30, or Free for EU students"}
        aria-label="Application fee"
        className="min-w-0 flex-1"
      />
      <Select
        name="application_fee_currency"
        defaultValue={currency}
        aria-label="Application fee currency"
        className="shrink-0"
        style={{ width: "5.5rem" }}
      >
        {options.map((c) => (
          <option key={c} value={c}>
            {c}
          </option>
        ))}
      </Select>
    </span>
  );
}
