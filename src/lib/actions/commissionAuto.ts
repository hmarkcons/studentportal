"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requirePermission } from "@/lib/auth/permissions";
import { commissionFor, type CommissionBasis, type CommissionRates } from "@/lib/staffCommissionBasis";

function one<T>(v: T | T[] | null) {
  return Array.isArray(v) ? v[0] ?? null : v;
}

/**
 * The consultancy fee this student's commission is a share of.
 *
 * Their signed agreement, net of discount, with the destination's track — the
 * same basis the Staff Commission page has always used to suggest an amount.
 */
async function basisFor(
  supabase: ReturnType<typeof createAdminClient>,
  studentId: string
): Promise<CommissionBasis | null> {
  const { data: agreement } = await supabase
    .from("agreements")
    .select(
      "discount_amount, consultancy_fee_override, template:agreement_templates(destination:destinations(track, consultancy_fee, consultancy_fee_currency))"
    )
    .eq("student_id", studentId)
    .eq("status", "signed")
    .limit(1)
    .maybeSingle();
  if (!agreement) return null;

  const template = one(agreement.template as never) as { destination?: unknown } | null;
  const destination = template?.destination
    ? (one(template.destination as never) as {
        track?: string;
        consultancy_fee?: number;
        consultancy_fee_currency?: string;
      } | null)
    : null;
  if (!destination) return null;

  return {
    track: destination.track ?? null,
    consultancyFee: (agreement.consultancy_fee_override ?? destination.consultancy_fee ?? 0) - (agreement.discount_amount ?? 0),
    currency: destination.consultancy_fee_currency ?? null,
  };
}

/**
 * Creates the commission a registered student earns their counselor, if it can
 * be worked out and does not exist already.
 *
 * Called where the facts change — when a student is marked registered, and
 * when their agreement is signed, which is usually when the fee becomes known
 * at all. Silent about the cases it cannot price: Payroll lists those with the
 * reason, which is the right place to act on them.
 *
 * Uses the admin client deliberately. This runs as a consequence of somebody
 * else's action — a counselor registering their own student — and that person
 * has no business writing to the commission ledger directly.
 */
export async function ensureCommissionForStudent(studentId: string): Promise<{ created: boolean; reason?: string }> {
  const admin = createAdminClient();

  const { data: student } = await admin
    .from("leads")
    .select("id, assigned_counselor_id, registered_at, registration_status")
    .eq("id", studentId)
    .maybeSingle();
  if (!student) return { created: false, reason: "Student not found" };
  if (student.registration_status !== "registered" || !student.registered_at) {
    return { created: false, reason: "Not registered" };
  }
  if (!student.assigned_counselor_id) return { created: false, reason: "No counselor assigned" };

  // Already in the ledger — including a row somebody typed by hand, and a
  // half of a shared commission. Never a second one.
  const { count } = await admin
    .from("staff_commissions")
    .select("id", { count: "exact", head: true })
    .eq("student_id", studentId);
  if ((count ?? 0) > 0) return { created: false, reason: "Already in the ledger" };

  const { data: staff } = await admin
    .from("staff")
    .select(
      "id, currency, commission_rate_general, commission_rate_public_universities, commission_type_general, commission_type_public_universities"
    )
    .eq("id", student.assigned_counselor_id)
    .maybeSingle();

  const outcome = commissionFor(staff as CommissionRates | null, await basisFor(admin, studentId));
  if (!outcome.ok) return { created: false, reason: outcome.reason };

  const { error } = await admin.from("staff_commissions").insert({
    staff_id: student.assigned_counselor_id,
    student_id: studentId,
    amount: outcome.amount,
    currency: outcome.currency,
    // The month the payroll will look for it in. A commission with no
    // registration date matches no month's filter and is invisible everywhere.
    registration_date: String(student.registered_at).slice(0, 10),
    status: "unpaid",
  });
  if (error) return { created: false, reason: error.message };

  revalidatePath("/finance/payroll");
  revalidatePath("/finance/staff-commission");
  return { created: true };
}

/**
 * Adds the commissions for every registered student in a month that has none.
 *
 * The counterpart to the automatic path: students registered before it
 * existed, and ones that could not be priced at the time because their
 * agreement was not signed yet.
 */
export async function addMissingCommissionsForMonth(staffId: string, month: string, revalidateTo: string) {
  const denied = await requirePermission("finance.commissions.manage", "Only Finance/Super Admin can add commission records.");
  if (denied) return { error: denied.error };

  const supabase = await createClient();
  const monthStart = `${month}-01`;
  const [y, m] = month.split("-").map(Number);
  const nextMonth = new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 10);

  const { data: students } = await supabase
    .from("leads")
    .select("id")
    .eq("assigned_counselor_id", staffId)
    .eq("registration_status", "registered")
    .gte("registered_at", monthStart)
    .lt("registered_at", nextMonth);

  let added = 0;
  const skipped: string[] = [];
  for (const s of students ?? []) {
    const result = await ensureCommissionForStudent(s.id);
    if (result.created) added++;
    else if (result.reason && result.reason !== "Already in the ledger") skipped.push(result.reason);
  }

  revalidatePath(revalidateTo);
  if (added === 0 && skipped.length > 0) {
    return { error: `Nothing could be added: ${Array.from(new Set(skipped)).join("; ")}.` };
  }
  return { success: true, added };
}
