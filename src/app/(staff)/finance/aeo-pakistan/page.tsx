import { getStaffSession } from "@/lib/auth/session";
import { loadAeoRecords, seesAeo } from "@/lib/aeoLoad";
import { karachiToday } from "@/lib/calendarDates";
import { Card } from "@/components/ui/Card";
import { AeoRegister } from "./AeoRegister";

/**
 * Accounts & Finance › AEO Pakistan: the commission owed for each IELTS
 * registration HMARK made at AEO Pakistan, and whether AEO has paid it
 * (0335). The office's own sheet, kept here — imported, edited, marked paid,
 * and exported back in the same layout.
 */
export default async function AeoPakistanPage() {
  const { supabase, staff } = await getStaffSession();
  // The layout's PageGuard has already let through only those the page is
  // for; the table's policies are the same two roles, so anyone else would
  // see an empty register rather than a refusal.
  if (!seesAeo(staff)) {
    return (
      <Card className="mt-6 max-w-xl">
        <h2 className="text-base font-semibold text-ink">AEO Pakistan is for the Super Admin and the account officer</h2>
      </Card>
    );
  }

  let records: Awaited<ReturnType<typeof loadAeoRecords>> = [];
  let failed: string | null = null;
  try {
    records = await loadAeoRecords(supabase);
  } catch (error) {
    failed = (error as Error).message;
  }

  return (
    <div className="flex w-full flex-col gap-5" data-aeo-page>
      <div>
        <h2 className="text-lg font-semibold text-ink">AEO Pakistan</h2>
        <p className="mt-0.5 text-sm text-muted">The commission AEO Pakistan owes for each IELTS registration, and what it has paid.</p>
      </div>
      {failed ? (
        <Card>
          <p className="text-sm text-danger">Could not read the record: {failed}</p>
        </Card>
      ) : (
        <AeoRegister records={records} today={karachiToday()} />
      )}
    </div>
  );
}
