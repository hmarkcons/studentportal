import Link from "next/link";
import { getStaffSession } from "@/lib/auth/session";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { StaffAgreementsPanel, STATUS_LABEL, STATUS_TONE } from "@/components/StaffAgreementsPanel";

type Status = keyof typeof STATUS_LABEL;

/**
 * The generator's Staff tab: every staff member with the state of their
 * latest agreement, so who still needs one — or has one waiting to be
 * verified — is plain from the list, and the chosen one's agreements beside it.
 */
export async function StaffAgreementGenerator({ selectedId }: { selectedId?: string }) {
  const { supabase } = await getStaffSession();
  const [{ data: staff }, { data: agreements }] = await Promise.all([
    supabase.from("staff").select("id, full_name, designation, status").order("full_name"),
    supabase.from("staff_agreements").select("staff_id, status, created_at").order("created_at", { ascending: false }),
  ]);

  const latest = new Map<string, Status>();
  for (const a of agreements ?? []) if (!latest.has(a.staff_id)) latest.set(a.staff_id, a.status as Status);
  const selected = (staff ?? []).find((s) => s.id === selectedId);

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,320px)_1fr]">
      <Card>
        <h3 className="mb-2 text-sm font-medium text-ink">Staff</h3>
        <ul className="flex flex-col divide-y divide-border">
          {(staff ?? []).map((s) => {
            const status = latest.get(s.id);
            return (
              <li key={s.id}>
                <Link
                  href={`/setup/agreement-generator?tab=staff&staff=${s.id}`}
                  data-full-width
                  className={`flex items-center justify-between gap-2 px-1 py-2 text-sm hover:bg-bg ${s.id === selectedId ? "font-medium text-primary" : "text-ink"}`}
                >
                  <span className="min-w-0">
                    {s.full_name}
                    {s.designation && <span className="block text-xs text-muted">{s.designation}</span>}
                  </span>
                  {status ? <Badge tone={STATUS_TONE[status]}>{STATUS_LABEL[status]}</Badge> : <Badge>None</Badge>}
                </Link>
              </li>
            );
          })}
        </ul>
      </Card>
      <Card>
        {selected ? (
          <>
            <h3 className="mb-3 text-sm font-medium text-ink">{selected.full_name}</h3>
            <StaffAgreementsPanel key={selected.id} staffId={selected.id} staffName={selected.full_name} />
          </>
        ) : (
          <p className="text-sm text-muted">Choose a staff member to generate, upload or manage their agreement.</p>
        )}
      </Card>
    </div>
  );
}
