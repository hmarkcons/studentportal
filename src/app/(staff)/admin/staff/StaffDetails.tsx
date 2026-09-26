import { staffRoles } from "@/lib/auth/roles";
import { formatDateOnly } from "@/lib/formatDate";
import { STAFF_ROLE_LABELS, CURRENCY_SYMBOLS } from "@/lib/constants";
import type { StaffRecord } from "./StaffForm";

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between border-b border-border py-2 text-sm last:border-0">
      <span className="text-muted">{label}</span>
      <span className="text-ink">{value ?? "—"}</span>
    </div>
  );
}

/**
 * A staff member's record, read-only: personal details, contact, pay and
 * status. The Super Admin's View panel on Staff Management, and — for anyone
 * else — their own record, which is the only one they see (0284).
 */
export function StaffDetails({ staff, photoUrl }: { staff: StaffRecord; photoUrl?: string | null }) {
  return (
    <div className="flex flex-col">
      {photoUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={photoUrl} alt="" className="mb-4 h-20 w-20 rounded-full border border-border object-cover" />
      )}
      <h4 className="mb-2 border-b border-border pb-1 text-xs font-semibold uppercase tracking-wide text-primary">Personal Information</h4>
      <Row label="Designation" value={staff.designation} />
      <Row
        label={staffRoles(staff).length > 1 ? "Roles" : "Role"}
        value={staffRoles(staff).map((r) => STAFF_ROLE_LABELS[r] ?? r).join(", ")}
      />
      <Row label="Gender" value={staff.gender} />
      <Row label="Date of birth" value={staff.date_of_birth ? formatDateOnly(staff.date_of_birth) : null} />
      <Row label="Marital status" value={staff.marital_status} />
      <Row label="CNIC" value={staff.cnic} />
      <Row label="Address" value={staff.address} />

      <h4 className="mt-4 mb-2 border-b border-border pb-1 text-xs font-semibold uppercase tracking-wide text-primary">Contact</h4>
      <Row label="Mobile (Personal)" value={staff.mobile_personal} />
      <Row label="Mobile (Official)" value={staff.mobile_official} />
      <Row label="Email (Personal)" value={staff.email_personal} />
      <Row label="Email (Official)" value={staff.email_official} />
      <Row label="Emergency contact" value={staff.emergency_contact_name} />
      <Row label="Emergency number" value={staff.emergency_contact_number} />
      <Row label="Emergency relation" value={staff.emergency_contact_relation} />

      <>
        <h4 className="mt-4 mb-2 border-b border-border pb-1 text-xs font-semibold uppercase tracking-wide text-primary">Compensation</h4>
        <Row
          label="Monthly salary"
          value={staff.monthly_salary != null ? `${CURRENCY_SYMBOLS[staff.currency] ?? staff.currency} ${staff.monthly_salary}` : null}
        />
        <Row label="Allowance" value={staff.allowance != null ? `${CURRENCY_SYMBOLS[staff.currency] ?? staff.currency} ${staff.allowance}` : null} />
        <Row
          label="Commission — private universities"
          value={
            staff.commission_rate_general != null
              ? staff.commission_type_general === "flat"
                ? `${CURRENCY_SYMBOLS[staff.currency] ?? staff.currency} ${staff.commission_rate_general} (flat)`
                : `${staff.commission_rate_general}%`
              : null
          }
        />
        <Row
          label="Commission — public universities"
          value={
            staff.commission_rate_public_universities != null
              ? staff.commission_type_public_universities === "flat"
                ? `${CURRENCY_SYMBOLS[staff.currency] ?? staff.currency} ${staff.commission_rate_public_universities} (flat)`
                : `${staff.commission_rate_public_universities}%`
              : null
          }
        />
        <Row label="Monthly target" value={staff.monthly_target} />
        <Row
          label="Monthly bonus"
          value={staff.bonus_eligible ? `Eligible — ${staff.bonus_rate_percent}% increment when target is hit` : "Not eligible"}
        />
      </>

      <h4 className="mt-4 mb-2 border-b border-border pb-1 text-xs font-semibold uppercase tracking-wide text-primary">Status</h4>
      <Row label="Status" value={staff.status === "active" ? "Active" : staff.status === "suspended" ? "Suspended" : "Inactive"} />
    </div>
  );
}
