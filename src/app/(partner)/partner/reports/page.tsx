import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/Card";

function one<T>(v: T | T[] | null) {
  return Array.isArray(v) ? v[0] ?? null : v;
}

export default async function PartnerReportsPage() {
  const supabase = await createClient();

  const { data: applications } = await supabase.rpc("get_partner_applications");

  // RLS (partner_commissions_select_partner) already scopes this to the
  // caller's own university via the joined application's university_id —
  // no extra filter needed here.
  const { data: commissions } = await supabase
    .from("partner_commissions")
    .select("expected_amount, paid_fee, currency, status, application:applications(program:programs(name))");

  const byProgram = new Map<string, { total: number; enrolled: number }>();
  const byIntake = new Map<string, number>();
  (applications ?? []).forEach((a: { program_name: string | null; current_stage: string; intake: string | null }) => {
    const key = a.program_name ?? "Unassigned program";
    const entry = byProgram.get(key) ?? { total: 0, enrolled: 0 };
    entry.total += 1;
    if (a.current_stage === "enrolled") entry.enrolled += 1;
    byProgram.set(key, entry);

    const intakeKey = a.intake ?? "Unspecified intake";
    byIntake.set(intakeKey, (byIntake.get(intakeKey) ?? 0) + 1);
  });

  // partner_commissions.currency is a free-typed field per row — group by
  // program AND currency instead of summing across currencies, same fix
  // already applied to the staff-side revenue/commission reports this
  // session (a mixed-currency program would otherwise silently label a
  // PKR total under whichever currency happened to be recorded first).
  const revenueByProgram = new Map<string, { programName: string; currency: string; expected: number; paid: number }>();
  (commissions ?? []).forEach((c) => {
    const programName = one(one(c.application)?.program)?.name ?? "Unassigned program";
    const currency = c.currency ?? "EUR";
    const key = `${programName}__${currency}`;
    const entry = revenueByProgram.get(key) ?? { programName, currency, expected: 0, paid: 0 };
    entry.expected += c.expected_amount ?? 0;
    entry.paid += c.status === "received" ? (c.paid_fee ?? c.expected_amount ?? 0) : 0;
    revenueByProgram.set(key, entry);
  });

  return (
    <div className="mx-auto max-w-3xl">
      <h2 className="mb-4 text-lg font-semibold text-ink">Reports</h2>

      <Card className="mb-6">
        <h3 className="mb-3 text-sm font-medium text-ink">Applications by program</h3>
        <div className="flex flex-col divide-y divide-border">
          {[...byProgram.entries()].map(([name, v]) => (
            <div key={name} className="flex items-center justify-between py-2 text-sm">
              <span className="text-ink">{name}</span>
              <span className="text-muted">
                {v.total} application{v.total === 1 ? "" : "s"} · {v.enrolled} enrolled
              </span>
            </div>
          ))}
          {byProgram.size === 0 && <p className="py-2 text-sm text-muted">No applications yet.</p>}
        </div>
      </Card>

      <Card className="mb-6">
        <h3 className="mb-3 text-sm font-medium text-ink">Applications by intake (semester-over-semester)</h3>
        <div className="flex flex-col divide-y divide-border">
          {[...byIntake.entries()].map(([intake, count]) => (
            <div key={intake} className="flex items-center justify-between py-2 text-sm">
              <span className="text-ink">{intake}</span>
              <span className="text-muted">{count}</span>
            </div>
          ))}
          {byIntake.size === 0 && <p className="py-2 text-sm text-muted">No applications yet.</p>}
        </div>
      </Card>

      <Card>
        <h3 className="mb-3 text-sm font-medium text-ink">Revenue & commission by program</h3>
        <div className="flex flex-col divide-y divide-border">
          {[...revenueByProgram.entries()].map(([key, v]) => (
            <div key={key} className="flex items-center justify-between py-2 text-sm">
              <span className="text-ink">{v.programName}</span>
              <span className="text-muted">
                {v.currency} {v.paid.toFixed(0)} received / {v.expected.toFixed(0)} expected
              </span>
            </div>
          ))}
          {revenueByProgram.size === 0 && <p className="py-2 text-sm text-muted">No commission records yet.</p>}
        </div>
      </Card>
    </div>
  );
}
