// The currency a student's agreement is written in (0351): euro or rupees, as
// chosen when it is made. Its figures come from its country in the country's
// fee currency — euro for the public universities, rupees for the private —
// and the amounts typed on the form (an override, a discount) are in that
// currency too. An agreement in the other currency is converted when it is
// printed, at the rupees-per-euro rate it keeps: the office's standard
// (Setup → Agreement templates, 335 to begin with) unless another was given
// for it.
//
// Pure, importing only another pure module, so the unit tests load it under
// plain Node.

import { parsePkrRate } from "./receiptPkr.ts";

export const AGREEMENT_CURRENCIES = ["EUR", "PKR"] as const;
export type AgreementCurrency = (typeof AGREEMENT_CURRENCIES)[number];

export const AGREEMENT_CURRENCY_LABELS: Record<AgreementCurrency, string> = {
  EUR: "EUR — euro",
  PKR: "PKR — rupees",
};

/** The rupees per euro an agreement is converted at before anyone sets another. */
export const STANDARD_AGREEMENT_PKR_PER_EUR = 335;

const isChoice = (c: unknown): c is AgreementCurrency => c === "EUR" || c === "PKR";

/** A country's fee currency, as its fees are entered: euro unless it says rupees. */
export function feeCurrencyOf(destinationCurrency: string | null | undefined): string {
  return destinationCurrency || "EUR";
}

/** The currency an agreement is in: its own choice, else its country's fee currency. */
export function agreementCurrencyOf(chosen: string | null | undefined, destinationCurrency: string | null | undefined): string {
  return isChoice(chosen) ? chosen : feeCurrencyOf(destinationCurrency);
}

/**
 * What an agreement prints before an amount. Rupees are written "PKR": the
 * rupee sign ₨ is not in the PDF's fonts, and an agreement in rupees printed a
 * stray mark where it should have been.
 */
export function agreementSymbol(currency: string): string {
  if (currency === "EUR") return "€";
  if (currency === "USD") return "$";
  return currency;
}

/**
 * A figure in one currency said in the other at a rupees-per-euro rate: to the
 * rupee one way, to the cent the other. Unchanged when the currencies are the
 * same, or when there is no rate to convert at.
 */
export function convertFee(n: number, from: string, to: string, rate: number | string | null | undefined): number {
  const r = Number(rate);
  if (from === to || !(r > 0)) return n;
  if (from === "EUR" && to === "PKR") return Math.round(n * r);
  if (from === "PKR" && to === "EUR") return Math.round((n / r) * 100) / 100;
  return n;
}

export type AgreementConversion = {
  /** The currency the agreement is printed in. */
  currency: string;
  /** The rate it was converted at; null when nothing was converted. */
  rate: number | null;
  /** A figure in the country's fee currency, in the agreement's. */
  convert: (n: number) => number;
};

/**
 * How an agreement's figures are printed. Euro to rupees is rounded to the
 * rupee — nobody quotes paisa — and rupees to euro to the cent. Each figure is
 * converted on its own and the totals are made from the converted figures, so
 * the payment chart still adds up.
 */
export function agreementConversion(
  destinationCurrency: string | null | undefined,
  agreement: { currency?: string | null; pkr_per_eur?: number | string | null }
): AgreementConversion | { error: string } {
  const from = feeCurrencyOf(destinationCurrency);
  const to = agreementCurrencyOf(agreement.currency, destinationCurrency);
  if (from === to) return { currency: to, rate: null, convert: (n) => n };
  const rate = Number(agreement.pkr_per_eur);
  if (!(rate > 0)) {
    return { error: `This agreement is in ${to} but its country's fees are in ${from}, and it has no exchange rate — edit the agreement and give one.` };
  }
  if (!AGREEMENT_CURRENCIES.includes(from as AgreementCurrency)) return { error: `This agreement cannot be converted from ${from} to ${to}.` };
  return { currency: to, rate, convert: (n) => convertFee(n, from, to, rate) };
}

export type AgreementCurrencyColumns = { currency: AgreementCurrency; pkr_per_eur: number | null };

/**
 * The currency and rate an agreement form posted, or null when it posted no
 * currency (an older form — the agreement stays in its country's currency).
 * A rate is needed, and kept, only when the agreement is in the other
 * currency than its country's fees.
 */
export function parseAgreementCurrency(
  form: { has(name: string): boolean; get(name: string): unknown },
  destinationCurrency: string | null | undefined
): AgreementCurrencyColumns | { error: string } | null {
  if (!form.has("currency")) return null;
  const currency = String(form.get("currency") ?? "").trim().toUpperCase();
  if (!isChoice(currency)) return { error: "Choose euro or rupees for the agreement." };
  if (currency === feeCurrencyOf(destinationCurrency)) return { currency, pkr_per_eur: null };
  const rate = parsePkrRate(form.get("pkr_per_eur"));
  if (rate === null) return { error: "Give the rupees per euro the agreement is converted at, e.g. 335." };
  return { currency, pkr_per_eur: rate };
}
