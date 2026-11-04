"use client";

import { useActionState, useState } from "react";
import { AGREEMENT_DATE_MAX, AGREEMENT_DATE_MIN } from "@/lib/agreementDate";
import { generateAgreement, updateAgreement, uploadSignedAgreement, deleteAgreement } from "@/lib/actions/agreements";
import { Button } from "@/components/ui/Button";
import { useButtonAction } from "@/components/useButtonAction";
import { toast } from "@/lib/toast";
import { FileField } from "@/components/FileField";
import { Input, Select } from "@/components/ui/Input";
import type { ServiceType } from "@/lib/serviceType";
import { STANDARD_CHILD_FEE, STANDARD_SPOUSE_FEE } from "@/lib/accompanyingFamily";
import { SRB_TAX_RATE } from "@/lib/invoiceMath";
import {
  AGREEMENT_CURRENCIES,
  AGREEMENT_CURRENCY_LABELS,
  STANDARD_AGREEMENT_PKR_PER_EUR,
  convertFee,
  feeCurrencyOf,
  type CountryFees,
} from "@/lib/agreementCurrency";

type AgreementTemplateOption = {
  id: string;
  name: string;
  signatory_name: string;
  destination: { id: string; display_name: string } | { id: string; display_name: string }[] | null;
  service_type?: string | null;
};

type Country = { id: string; display_name: string };

/** Who is accompanying the student by their registration, and the fees set for them there (0350), in the country's currency. */
export type RegisteredFamily = { spouses: number; children: number; spouseFee: number | null; childFee: number | null };

function templateDest(d: AgreementTemplateOption["destination"]) {
  return Array.isArray(d) ? d[0] : d;
}

/** A visa-service template for every destination (0298): the country is chosen with it. */
function isGeneral(t: AgreementTemplateOption | undefined) {
  return Boolean(t) && !templateDest(t!.destination) && t!.service_type === "visa_only";
}

function templateLabel(t: AgreementTemplateOption) {
  return isGeneral(t) ? `All destinations — ${t.name}` : `${templateDest(t.destination)?.display_name} — ${t.name}`;
}

/**
 * Which of the student's countries a general template's agreement is for. The
 * agreement records it (agreements.destination_id), and its fee and its
 * currency come from that country.
 */
function CountryFor({ countries, value, onChange, wide = false }: { countries: Country[]; value: string; onChange: (id: string) => void; wide?: boolean }) {
  return (
    <Select name="destination_id" required value={value} onChange={(e) => onChange(e.target.value)} className={wide ? "w-full" : undefined} aria-label="Country">
      <option value="">Country…</option>
      {countries.map((c) => (
        <option key={c.id} value={c.id}>
          {c.display_name}
        </option>
      ))}
    </Select>
  );
}

const amountText = (currency: string, n: number) =>
  `${currency === "EUR" ? "€" : `${currency} `}${n.toLocaleString("en-US", { maximumFractionDigits: 2 })}`;

const asText = (n: number | null | undefined) => (n == null ? "" : String(n));

/**
 * Every amount on the agreement, in the currency it is written in (0351, 0352).
 *
 * It opens on the agreement's currency — a new one on its country's own fee
 * currency — and choosing the other asks for the rupees per euro, starting from
 * the office's standard in Setup › Agreement templates. What is typed here is
 * in the agreement's currency: switching it converts whatever has been typed
 * (an admin charge or consultancy fee over the country's, the discount, a visa
 * service fee), and the country's standard fees, used where nothing is typed,
 * are said in it too. Remounted for each country, so a figure for one never
 * carries over to another.
 *
 * A visa documentation and application agreement (0279) has the visa service
 * fee alone — no administrative charge, no consultancy fee — and a backup
 * country's the administrative charge alone.
 */
function MoneyFields({
  fees,
  visaFee,
  countryName,
  isVisaOnly,
  isBackup,
  initial,
  standardRate,
  family,
  wide = false,
}: {
  /** The country's standard fees, in its fee currency. */
  fees: CountryFees | undefined;
  /** The family on the registration, which the agreement charges for where its country allows family. */
  family?: RegisteredFamily | null;
  /** The country's visa service fee, in its fee currency. */
  visaFee: number | null | undefined;
  countryName: string | null;
  isVisaOnly: boolean;
  isBackup: boolean;
  /** What the agreement holds, in its own currency — or, for a new one, the registration's discount. */
  initial: {
    currency?: string | null;
    rate?: number | null;
    admin?: number | null;
    consultancy?: number | null;
    discount?: number | null;
    visa?: number | null;
    installments?: number | null;
    /** The fee per spouse and per child it charges, in its own currency. */
    spouseFee?: number | null;
    childFee?: number | null;
    /** SRB tax percent (0353); a new agreement opens on the standard 5. */
    taxRate?: number | null;
  };
  standardRate: number;
  wide?: boolean;
}) {
  const feeCurrency = feeCurrencyOf(fees?.currency);
  const [currency, setCurrency] = useState<string>(
    initial.currency === "EUR" || initial.currency === "PKR" ? initial.currency : feeCurrency === "PKR" ? "PKR" : "EUR"
  );
  const [rate, setRate] = useState(String(initial.rate ?? standardRate));
  const [admin, setAdmin] = useState(asText(initial.admin));
  const [consultancy, setConsultancy] = useState(asText(initial.consultancy));
  const [discount, setDiscount] = useState(asText(initial.discount));
  const [visa, setVisa] = useState(asText(initial.visa));
  const [spouseFee, setSpouseFee] = useState(asText(initial.spouseFee));
  const [childFee, setChildFee] = useState(asText(initial.childFee));
  const [taxRate, setTaxRate] = useState(String(initial.taxRate ?? SRB_TAX_RATE));
  const rateNumber = Number(rate) > 0 ? Number(rate) : standardRate;
  const converting = currency !== feeCurrency;
  const fromCountry = (n: number) => convertFee(n, feeCurrency, currency, rateNumber);

  // Whatever has been typed goes with the currency: 1,800 in euro is 603,000 in rupees at 335.
  function changeCurrency(next: string) {
    const swap = (v: string) => (v.trim() === "" || !Number.isFinite(Number(v)) ? v : String(convertFee(Number(v), currency, next, rateNumber)));
    setAdmin(swap(admin));
    setConsultancy(swap(consultancy));
    setDiscount(swap(discount));
    setVisa(swap(visa));
    setSpouseFee(swap(spouseFee));
    setChildFee(swap(childFee));
    setCurrency(next);
  }

  const box = (narrow: string) => (wide ? "w-full" : narrow);
  // Captioned, not only placeholdered: a figure converted into the box hides its placeholder.
  const caption = `flex flex-col gap-0.5 text-xs text-muted ${wide ? "w-full" : ""}`;
  // The accompanying family (0350): charged on a full agreement for a country
  // that allows family, at the fee the registration set — the country's
  // standard where it set none — unless another is typed here.
  const charged = !isVisaOnly && !isBackup && Boolean(fees?.allowsFamily);
  const spouses = charged ? (family?.spouses ?? 0) : 0;
  const children = charged ? (family?.children ?? 0) : 0;
  const registeredSpouseFee = family?.spouseFee ?? fees?.spouse ?? STANDARD_SPOUSE_FEE;
  const registeredChildFee = family?.childFee ?? fees?.child ?? STANDARD_CHILD_FEE;
  const standard = [
    !isVisaOnly && fees?.admin != null ? `admin charge ${amountText(currency, fromCountry(fees.admin))}` : null,
    !isVisaOnly && !isBackup && fees?.consultancy != null ? `consultancy fee ${amountText(currency, fromCountry(fees.consultancy))}` : null,
    isVisaOnly && visaFee != null ? `visa service fee ${amountText(currency, fromCountry(visaFee))}` : null,
    spouses > 0 ? `${amountText(currency, fromCountry(registeredSpouseFee))} per spouse` : null,
    children > 0 ? `${amountText(currency, fromCountry(registeredChildFee))} per child` : null,
  ].filter((s): s is string => Boolean(s));

  return (
    <>
      <label className={`flex flex-col gap-0.5 text-xs text-muted ${wide ? "w-full" : ""}`}>
        Agreement currency
        <Select name="currency" value={currency} onChange={(e) => changeCurrency(e.target.value)} className={wide ? "w-full" : undefined} data-agreement-currency>
          {AGREEMENT_CURRENCIES.map((c) => (
            <option key={c} value={c}>
              {AGREEMENT_CURRENCY_LABELS[c]}
            </option>
          ))}
        </Select>
      </label>
      {converting && (
        <label className={`flex flex-col gap-0.5 text-xs text-muted ${wide ? "w-full" : ""}`}>
          Rupees per €1
          <Input
            name="pkr_per_eur"
            type="number"
            step="any"
            min="1"
            max="10000"
            required
            value={rate}
            onChange={(e) => setRate(e.target.value)}
            className={box("w-28")}
            title="The rate the country's fees are converted at"
            data-agreement-rate
          />
        </label>
      )}
      {isVisaOnly ? (
        <>
          <label className={caption}>
            Visa service fee ({currency})
            <Input
              name="visa_service_fee_override"
              type="number"
              step="0.01"
              min="0"
              placeholder="Country's standard"
              value={visa}
              onChange={(e) => setVisa(e.target.value)}
              className={box("w-44")}
              data-visa-fee-input
            />
          </label>
          <label className={caption}>
            Discount ({currency})
            <Input
              name="discount_amount"
              type="number"
              step="0.01"
              placeholder="None"
              value={discount}
              onChange={(e) => setDiscount(e.target.value)}
              className={box("w-36")}
              data-agreement-discount
            />
          </label>
          <Select name="installment_count" defaultValue={String(initial.installments ?? 1)} className={wide ? "w-full" : undefined}>
            <option value="1">1 visa service fee installment</option>
            <option value="2">2 visa service fee installments</option>
            <option value="3">3 visa service fee installments</option>
          </Select>
        </>
      ) : (
        <>
          <label className={caption}>
            Admin charge ({currency})
            <Input
              name="admin_charge_override"
              type="number"
              step="0.01"
              placeholder="Country's standard"
              value={admin}
              onChange={(e) => setAdmin(e.target.value)}
              className={box("w-44")}
              data-agreement-admin
            />
          </label>
          {!isBackup && (
            <>
              <label className={caption}>
                Consultancy fee ({currency})
                <Input
                  name="consultancy_fee_override"
                  type="number"
                  step="0.01"
                  placeholder="Country's standard"
                  value={consultancy}
                  onChange={(e) => setConsultancy(e.target.value)}
                  className={box("w-44")}
                  data-agreement-consultancy
                />
              </label>
              <label className={caption}>
                Discount ({currency})
                <Input
                  name="discount_amount"
                  type="number"
                  step="0.01"
                  placeholder="None"
                  value={discount}
                  onChange={(e) => setDiscount(e.target.value)}
                  className={box("w-36")}
                  data-agreement-discount
                />
              </label>
              {spouses > 0 && (
                <label className={caption}>
                  Fee per spouse ({currency}) × {spouses}
                  <Input
                    name="agreement_spouse_fee"
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="Registration's"
                    value={spouseFee}
                    onChange={(e) => setSpouseFee(e.target.value)}
                    className={box("w-44")}
                    data-agreement-spouse-fee
                  />
                </label>
              )}
              {children > 0 && (
                <label className={caption}>
                  Fee per child ({currency}) × {children}
                  <Input
                    name="agreement_child_fee"
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="Registration's"
                    value={childFee}
                    onChange={(e) => setChildFee(e.target.value)}
                    className={box("w-44")}
                    data-agreement-child-fee
                  />
                </label>
              )}
              <Select name="installment_count" defaultValue={String(initial.installments ?? 1)} className={wide ? "w-full" : undefined}>
                <option value="1">1 consultancy fee installment</option>
                <option value="2">2 consultancy fee installments</option>
                <option value="3">3 consultancy fee installments</option>
              </Select>
            </>
          )}
        </>
      )}
      {/* SRB tax (0353): a percentage, so it does not change with the currency. */}
      <label className={caption}>
        SRB tax (%)
        <Input
          name="tax_rate"
          type="number"
          step="0.01"
          min="0"
          max="100"
          required
          value={taxRate}
          onChange={(e) => setTaxRate(e.target.value)}
          className={box("w-24")}
          title="On the total after discount; 0 for none"
          data-agreement-tax
        />
      </label>
      <p className="w-full text-xs text-muted" data-agreement-standard-fees>
        {isVisaOnly && "Visa documentation & application only — no administrative charge and no consultancy fee. "}
        Every amount is in {currency}
        {converting ? `, and the country's fees, in ${feeCurrency}, are converted at this rate, which the agreement keeps` : ""}.
        {standard.length > 0 && ` Left blank, each is the country's standard: ${standard.join(" · ")}.`}
        {Number(taxRate) > 0 && ` SRB tax of ${taxRate}% is added on the total after discount.`}
        {isVisaOnly && countryName && visaFee == null && (
          <span className="text-warning"> No visa service fee is set for {countryName} in Setup › Destinations, so enter one here.</span>
        )}
      </p>
    </>
  );
}

// A backup-country destination (per this student's lead_destinations —
// see students/[id]/page.tsx) only ever gets an administrative-fee-only
// agreement (no consultancy fee, see generateAgreement/generateAgreementPdf),
// so once staff picks such a template the consultancy/discount/installment
// fields would just be silently ignored server-side — hiding them here
// instead of letting staff fill in values that go nowhere.
/** The date printed on the agreement (0310): today unless another day is chosen, past or future. */
function AgreementDateField({ defaultValue, wide = false }: { defaultValue: string; wide?: boolean }) {
  return (
    <label className={`flex flex-col gap-0.5 text-xs text-muted ${wide ? "w-full" : ""}`}>
      Agreement date
      <Input
        name="agreement_date"
        type="date"
        required
        defaultValue={defaultValue}
        min={AGREEMENT_DATE_MIN}
        max={AGREEMENT_DATE_MAX}
        className={wide ? "w-full" : "w-40"}
        title="The date printed on the agreement"
      />
    </label>
  );
}

export function GenerateAgreementForm({
  studentId,
  templates,
  discountAmount,
  backupDestinationIds = [],
  missingTemplateFor = [],
  hasCountry = true,
  service = "full",
  visaFees = {},
  countries = [],
  today,
  countryFees = {},
  standardRate = STANDARD_AGREEMENT_PKR_PER_EUR,
  family = null,
}: {
  studentId: string;
  /** The family on their registration (0350): a fee per spouse and per child can be typed for the agreement. */
  family?: RegisteredFamily | null;
  /** Each country's standard fees and their currency, by destination id — what the agreement converts from (0351). */
  countryFees?: Record<string, CountryFees>;
  /** Rupees per euro as standard (Setup › Agreement templates), offered when converting (0351). */
  standardRate?: number;
  /** Today in Karachi, read on the server: the agreement's date unless another is chosen (0310). */
  today: string;
  /** Already narrowed to this student's own countries and service — see agreementTemplateChoices and templatesForService. */
  templates: AgreementTemplateOption[];
  /** The student's countries, primary first — offered with a general template. */
  countries?: Country[];
  discountAmount?: number | null;
  backupDestinationIds?: string[];
  /** Countries they are registered for that nobody has written a template for. */
  missingTemplateFor?: string[];
  /** False when their registration has no country at all. */
  hasCountry?: boolean;
  /** Which service they are registered for (0279). */
  service?: ServiceType;
  /** Each country's visa service fee from Setup, by destination id. */
  visaFees?: Record<string, number | null>;
}) {
  const action = generateAgreement.bind(null, studentId);
  const [state, formAction, pending] = useActionState(action, undefined);
  const [templateId, setTemplateId] = useState("");
  const [countryId, setCountryId] = useState(countries[0]?.id ?? "");
  const chosenTemplate = templates.find((t) => t.id === templateId);
  const general = isGeneral(chosenTemplate);
  const chosenDest = general
    ? (countries.find((c) => c.id === countryId) ?? null)
    : templateDest(chosenTemplate?.destination ?? null);
  const isVisaOnly = service === "visa_only";
  // A backup country's administrative-fee-only agreement has no meaning for
  // a visa-only client, who pays no administrative fee at all.
  const isBackup = !isVisaOnly && backupDestinationIds.includes(chosenDest?.id ?? "");

  // An empty dropdown with no explanation is the worst version of this. The
  // two reasons it can be empty need different people to do different things,
  // so they are said apart.
  if (!hasCountry) {
    return (
      <p className="rounded-md border border-warning bg-warning-bg px-3 py-2 text-xs text-warning">
        This student has no country on their registration yet, so there is no agreement to generate. Set their country
        in the <strong className="font-medium">Registration &amp; Portal Access</strong> card above.
      </p>
    );
  }
  if (templates.length === 0 && isVisaOnly) {
    return (
      <p className="rounded-md border border-warning bg-warning-bg px-3 py-2 text-xs text-warning" data-no-visa-template>
        This student is registered for the visa service only, and no visa-service agreement template has been written for{" "}
        <strong className="font-medium">{missingTemplateFor.join(", ") || "their country"}</strong> yet. Add one in Setup ›
        Agreement templates with its service set to &ldquo;Visa documentation &amp; application only&rdquo; and it will
        appear here.
      </p>
    );
  }
  if (templates.length === 0) {
    return (
      <p className="rounded-md border border-warning bg-warning-bg px-3 py-2 text-xs text-warning">
        No agreement template has been written for{" "}
        <strong className="font-medium">{missingTemplateFor.join(", ") || "their country"}</strong> yet. Add one in
        Setup › Agreement templates and it will appear here.
      </p>
    );
  }

  return (
    <form action={formAction} className="flex flex-wrap items-end gap-2" data-agreement-service={service}>
      <Select name="template_id" required value={templateId} onChange={(e) => setTemplateId(e.target.value)}>
        <option value="">Template…</option>
        {templates.map((t) => (
          <option key={t.id} value={t.id}>
            {templateLabel(t)}
            {!isVisaOnly && backupDestinationIds.includes(templateDest(t.destination)?.id ?? "") ? " (Backup)" : ""}
          </option>
        ))}
      </Select>
      {general && <CountryFor countries={countries} value={countryId} onChange={setCountryId} />}
      <Select name="signing_method" required>
        <option value="paper">Paper (Karachi)</option>
        <option value="e_signature">E-signature (outside Karachi)</option>
      </Select>
      <AgreementDateField defaultValue={today} />
      {chosenDest && (
        <MoneyFields
          // A new set for each country and each kind of agreement: a figure typed for one is not the other's.
          key={`${chosenDest.id}-${isBackup ? "backup" : "main"}`}
          fees={countryFees[chosenDest.id]}
          visaFee={visaFees[chosenDest.id]}
          countryName={chosenDest.display_name ?? null}
          isVisaOnly={isVisaOnly}
          isBackup={isBackup}
          // The registration's discount, in the country's currency — which a new agreement opens on.
          initial={{ discount: discountAmount }}
          standardRate={standardRate}
          family={family}
        />
      )}
      <Button type="submit" variant="primary" pending={pending} status={{ state, label: "Generated." }}>
        Generate agreement
      </Button>
      {isBackup && (
        <p className="w-full text-xs text-muted">Backup country — this agreement will show the administrative fee only, no consultancy fee.</p>
      )}
      {/* Some of their countries are covered and some are not, which reads as
          a missing option unless it is said. */}
      {missingTemplateFor.length > 0 && (
        <p className="w-full text-xs text-warning">
          No template exists yet for {missingTemplateFor.join(", ")} — add one in Setup › Agreement templates to
          generate that one.
        </p>
      )}
      {state?.error && <p className="text-xs text-danger">{state.error}</p>}
    </form>
  );
}

export function EditAgreementForm({
  agreement,
  studentId,
  templates,
  backupDestinationIds = [],
  service = "full",
  visaFees = {},
  onSuccess,
  countries = [],
  countryFees = {},
  standardRate = STANDARD_AGREEMENT_PKR_PER_EUR,
  family = null,
}: {
  agreement: {
    id: string;
    template_id: string | null;
    signing_method: string | null;
    admin_charge_override: number | null;
    consultancy_fee_override: number | null;
    discount_amount: number | null;
    installment_count: number | null;
    visa_service_fee_override?: number | null;
    /** Its own country (0298). */
    destination_id?: string | null;
    /** The date printed on it (0310). */
    agreement_date?: string | null;
    /** The currency it is printed in and the rate it keeps (0351). */
    currency?: string | null;
    pkr_per_eur?: number | null;
    /** The fee per spouse and per child it charges, in its own currency (0350). */
    spouse_fee?: number | null;
    child_fee?: number | null;
    /** SRB tax percent (0353); null on one made before, which carries none. */
    tax_rate?: number | null;
  };
  /** The family on the registration, which saving takes again (0350). */
  family?: RegisteredFamily | null;
  studentId: string;
  templates: AgreementTemplateOption[];
  backupDestinationIds?: string[];
  service?: ServiceType;
  visaFees?: Record<string, number | null>;
  /** The student's countries — offered with a general template. */
  countries?: Country[];
  /** Each country's standard fees and their currency, by destination id (0351). */
  countryFees?: Record<string, CountryFees>;
  /** Rupees per euro as standard, for an agreement that had none (0351). */
  standardRate?: number;
  onSuccess: () => void;
}) {
  const action = updateAgreement.bind(null, agreement.id, studentId);
  const [state, formAction, pending] = useActionState(action, undefined);
  const [templateId, setTemplateId] = useState(agreement.template_id ?? "");
  const [countryId, setCountryId] = useState(agreement.destination_id ?? countries[0]?.id ?? "");
  const chosenTemplate = templates.find((t) => t.id === templateId);
  const general = isGeneral(chosenTemplate);
  const chosenDest = general
    ? (countries.find((c) => c.id === countryId) ?? null)
    : templateDest(chosenTemplate?.destination ?? null);
  const isVisaOnly = service === "visa_only";
  const isBackup = !isVisaOnly && backupDestinationIds.includes(chosenDest?.id ?? "");
  // What it holds, in its own currency, belongs to its own country; another country starts afresh.
  const ownCountry = chosenDest?.id === (agreement.destination_id ?? templateDest(templates.find((t) => t.id === agreement.template_id)?.destination ?? null)?.id);

  return (
    <form action={formAction} className="flex w-full flex-col flex-wrap items-end gap-2">
      <Select name="template_id" value={templateId} onChange={(e) => setTemplateId(e.target.value)} required className="w-full">
        <option value="">Template…</option>
        {templates.map((t) => (
          <option key={t.id} value={t.id}>
            {templateLabel(t)}
            {!isVisaOnly && backupDestinationIds.includes(templateDest(t.destination)?.id ?? "") ? " (Backup)" : ""}
          </option>
        ))}
      </Select>
      {general && <CountryFor countries={countries} value={countryId} onChange={setCountryId} wide />}
      {agreement.agreement_date && <AgreementDateField defaultValue={agreement.agreement_date} wide />}
      <Select name="signing_method" defaultValue={agreement.signing_method ?? "paper"} required className="w-full">
        <option value="paper">Paper (Karachi)</option>
        <option value="e_signature">E-signature (outside Karachi)</option>
      </Select>
      {chosenDest && (
        <MoneyFields
          key={`${chosenDest.id}-${isBackup ? "backup" : "main"}`}
          fees={countryFees[chosenDest.id]}
          visaFee={visaFees[chosenDest.id]}
          countryName={chosenDest.display_name ?? null}
          isVisaOnly={isVisaOnly}
          isBackup={isBackup}
          initial={
            ownCountry
              ? {
                  currency: agreement.currency,
                  rate: agreement.pkr_per_eur,
                  admin: agreement.admin_charge_override,
                  consultancy: agreement.consultancy_fee_override,
                  discount: agreement.discount_amount,
                  visa: agreement.visa_service_fee_override,
                  installments: agreement.installment_count,
                  spouseFee: agreement.spouse_fee,
                  childFee: agreement.child_fee,
                  // One made before 0353 carries no tax: correcting it does not add any unless asked.
                  taxRate: agreement.tax_rate ?? 0,
                }
              : { installments: agreement.installment_count, taxRate: agreement.tax_rate ?? 0 }
          }
          standardRate={standardRate}
          family={family}
          wide
        />
      )}
      {isBackup && (
        <p className="w-full text-xs text-muted">Backup country — this agreement will show the administrative fee only, no consultancy fee.</p>
      )}
      <div className="flex w-full items-center gap-2">
        <Button type="submit" variant="primary" size="sm" pending={pending} status={{ state, label: "Saved." }}>
          Save
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={onSuccess}>
          {state?.success ? "Close" : "Cancel"}
        </Button>
      </div>
      {state?.error && <p className="w-full text-xs text-danger">{state.error}</p>}
      <p className="w-full text-xs text-muted">
        Saving does not regenerate the PDF — use &quot;Regenerate PDF&quot; afterward to apply these changes to the document.
      </p>
    </form>
  );
}

export function DeleteAgreementButton({ agreementId, studentId }: { agreementId: string; studentId: string }) {
  // The agreement, and this button with it, goes when the delete works — so
  // it confirms with a toast, and a refusal is said under the button.
  const del = useButtonAction();

  async function handleDelete() {
    if (!confirm("Delete this agreement? This cannot be undone.")) return;
    await del.run(() => deleteAgreement(agreementId, studentId), { toast: "Deleted." });
  }

  return (
    <div>
      <button
        onClick={handleDelete}
        disabled={del.pending}
        aria-busy={del.pending || undefined}
        className="w-fit text-xs text-danger hover:underline disabled:opacity-50"
      >
        Delete
      </button>
      {del.state?.error && <p className="mt-1 text-xs text-danger">{del.state.error}</p>}
    </div>
  );
}

// `replace` is for a paper agreement that is already signed: uploading the
// wrong scan used to be uncorrectable, because the upload sets status=signed
// and every caller hid this form once it was. The only way out was deleting
// the agreement and regenerating it. Super Admin can now swap the file, and
// the action supersedes the old object rather than leaving it in the
// student's folder.
export function UploadSignedAgreementForm({
  agreementId,
  studentId,
  replace = false,
}: {
  agreementId: string;
  studentId: string;
  replace?: boolean;
}) {
  const upload = uploadSignedAgreement.bind(null, agreementId, studentId);
  // A first upload marks the agreement signed, and the page then shows the
  // review in place of this form — so that one confirms with a toast. A
  // replacement stays on screen and says "Uploaded." beside its button.
  const action = async (prevState: unknown, formData: FormData) => {
    const result = await upload(prevState, formData);
    if (!replace && !result?.error) toast("Uploaded.");
    return result;
  };
  const [state, formAction, pending] = useActionState(action, undefined);
  const [ready, setReady] = useState(false);

  return (
    <form action={formAction} className="mt-2 flex flex-col gap-2">
      {replace && <p className="text-xs text-muted">Replaces the signed copy on file. The previous scan is deleted.</p>}
      {/* File input sits directly next to the button it feeds. */}
      <div className="flex flex-wrap items-start gap-2">
        <FileField multiple required noun="agreement" hint="Scan or photo of the signed copy" onChange={(s) => setReady(Boolean(s.file))} />
        <Button
          type="submit"
          variant="outline-primary"
          size="sm"
          pending={pending}
          disabled={!ready}
          status={{ state, label: "Uploaded." }}
        >
          {replace ? "Replace signed agreement" : "Upload signed agreement"}
        </Button>
      </div>
      <label className="flex items-center gap-1 text-xs text-muted">
        <input type="checkbox" name="email_verified" /> Email verified
      </label>
      {state?.error && <p className="text-xs text-danger">{state.error}</p>}
    </form>
  );
}
