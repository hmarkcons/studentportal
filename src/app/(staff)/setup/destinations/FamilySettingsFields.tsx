import { Input } from "@/components/ui/Input";
import { STANDARD_CHILD_FEE, STANDARD_SPOUSE_FEE } from "@/lib/accompanyingFamily";

/**
 * Whether a student going to this country may bring a spouse and children,
 * and the consultancy fee charged for each (0350). When it is on, registration
 * asks who is accompanying the student, and their fees go into the agreement's
 * payment chart and the invoice.
 */
export function FamilySettingsFields({
  allows = false,
  spouseFee = STANDARD_SPOUSE_FEE,
  childFee = STANDARD_CHILD_FEE,
  currency,
}: {
  allows?: boolean | null;
  spouseFee?: number | null;
  childFee?: number | null;
  currency?: string | null;
}) {
  return (
    <fieldset className="flex flex-col gap-3 rounded-lg border border-border p-3" data-family-settings>
      {/* Marks the form as carrying these fields, so a form without them never switches family off. */}
      <input type="hidden" name="family_settings" value="1" />
      <legend className="px-1 text-sm font-medium text-ink">Accompanying family</legend>
      <label className="flex items-center gap-2 text-sm text-ink">
        <input type="checkbox" name="allows_dependants" defaultChecked={Boolean(allows)} className="h-4 w-4 accent-[var(--primary)]" />
        Students going here may bring a spouse and children
      </label>
      <div className="grid grid-cols-2 gap-4">
        <label className="flex flex-col gap-1.5 text-sm font-medium text-ink">
          Consultancy fee per spouse
          <Input name="spouse_fee" type="number" step="0.01" min="0" defaultValue={spouseFee ?? STANDARD_SPOUSE_FEE} required />
        </label>
        <label className="flex flex-col gap-1.5 text-sm font-medium text-ink">
          Consultancy fee per child
          <Input name="child_fee" type="number" step="0.01" min="0" defaultValue={childFee ?? STANDARD_CHILD_FEE} required />
        </label>
      </div>
      <p className="text-xs text-muted">
        In the fee currency{currency ? ` (${currency})` : ""}. Registration pre-fills these for each spouse and child, and staff can change them for one
        student; the agreement adds them to the consultancy fee, spread over the instalments.
      </p>
    </fieldset>
  );
}
