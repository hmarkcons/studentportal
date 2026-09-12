import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { DataTable } from "@/components/ui/DataTable";
import { EmptyState } from "@/components/ui/EmptyState";
import { StatCard } from "@/components/ui/StatCard";
import { hasPermission } from "@/lib/auth/permissions";
import { formatAmount } from "@/lib/marketing";
import { karachiToday } from "@/lib/calendarDates";
import { IncentiveAmountInput } from "./IncentiveAmountInput";
import { LogReferralForm } from "./LogReferralForm";
import { ReferralPartyForm, type ReferralParty } from "./ReferralPartyForm";
import { ReferralPaymentCell } from "./ReferralPaymentCell";

export const dynamic = "force-dynamic";

const CURRENCIES = ["PKR", "USD", "EUR", "GBP", "AED"];

export default async function ReferralsPage() {
  const supabase = await createClient();
  const today = karachiToday();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: staffRow } = await supabase.from("staff").select("role").eq("id", user?.id ?? "").maybeSingle();
  const orgWideRoles = ["management", "super_admin", "marketing", "digital_marketing", "finance"];

  // Referral work is org-wide — who referred a student isn't a case-ownership
  // question — so the student picker shouldn't be narrowed to a Counselor's
  // own assigned students the way leads_select restricts it. But that breadth
  // is only warranted for the roles leads_select's own org-wide clause already
  // grants it to; going through the admin client for every role would let any
  // staff member browse every counselor's students by name just by opening
  // this page. Anyone else falls back to the session client, scoped by RLS.
  const leadsClient = staffRow && orgWideRoles.includes(staffRow.role) ? createAdminClient() : supabase;
  const { data: students } = await leadsClient
    .from("leads")
    .select("id, full_name, registered_at, registration_status")
    .eq("registration_status", "registered")
    .not("registered_at", "is", null)
    .order("full_name");

  const [{ data: parties }, { data: balances }, { data: referrals }] = await Promise.all([
    supabase.from("referral_parties").select("*").order("full_name"),
    supabase.from("referral_party_balances").select("*").order("amount_owed", { ascending: false }),
    supabase
      .from("referrals")
      .select(
        "id, referrer_name, referral_party_id, incentive_owed, incentive_status, currency, paid_on, payment_method, payment_reference, notes, created_at, lead_id"
      )
      .order("created_at", { ascending: false }),
  ]);

  // Attaching an amount and declaring it paid is Finance's, not everyone's.
  const canSetIncentives = await hasPermission("marketing.referral_incentives");
  // Logging a referral and keeping the parties is the same list by default,
  // but a separate permission so Admin > Role Permissions can move either.
  const canManage = await hasPermission("marketing.referrals.manage");

  const partyRows = (parties ?? []) as ReferralParty[];
  const partyById = new Map(partyRows.map((p) => [p.id, p]));
  const studentById = new Map((students ?? []).map((s) => [s.id, s]));
  const rows = referrals ?? [];

  // Which parties already have a given student, so the form can say so rather
  // than letting somebody log a duplicate and meet a constraint.
  const referredBy = new Map<string, string[]>();
  for (const r of rows) {
    if (!r.referral_party_id) continue;
    referredBy.set(r.lead_id, [...(referredBy.get(r.lead_id) ?? []), r.referral_party_id]);
  }

  const owedRows = rows.filter((r) => r.incentive_status !== "paid");
  const owedTotal = owedRows.reduce((sum, r) => sum + Number(r.incentive_owed ?? 0), 0);
  const paidTotal = rows.filter((r) => r.incentive_status === "paid").reduce((sum, r) => sum + Number(r.incentive_owed ?? 0), 0);
  // A referral logged with no figure is not settled, it is unpriced — and it
  // is the one thing on this page that silently understates what is owed.
  const unpriced = owedRows.filter((r) => r.incentive_owed === null).length;

  return (
    <div className="w-full">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-ink">Referral Commissions</h2>
          <p className="text-sm text-muted">
            Sub-agents and other outside referrers, and what the office owes them for the students they sent.
          </p>
        </div>
        {canManage && (
          <div className="flex gap-2">
            <ReferralPartyForm trigger={<Button type="button">+ Referring party</Button>} />
            <LogReferralForm
              parties={partyRows.filter((p) => p.is_active).map((p) => ({ id: p.id, full_name: p.full_name, organisation: p.organisation }))}
              students={(students ?? []).map((s) => ({
                id: s.id,
                full_name: s.full_name,
                registered_at: s.registered_at,
                alreadyReferredBy: referredBy.get(s.id) ?? [],
              }))}
              currencies={CURRENCIES}
            />
          </div>
        )}
      </div>

      <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Referring parties" value={String(partyRows.length)} />
        <StatCard label="Referrals logged" value={String(rows.length)} />
        <StatCard label="Outstanding" value={formatAmount(owedTotal)} />
        <StatCard label="Paid out" value={formatAmount(paidTotal)} />
      </div>

      {unpriced > 0 && (
        <p className="mb-4 rounded-md border border-warning bg-warning-bg px-3 py-2 text-xs text-warning">
          {unpriced} {unpriced === 1 ? "referral has" : "referrals have"} no commission set yet, so the outstanding total
          above is lower than what will actually be owed.
        </p>
      )}

      {/* ---------------------------------------- what is owed, per referral */}
      <h3 className="mb-2 text-sm font-semibold text-ink">Commission payments</h3>
      {rows.length === 0 ? (
        <Card className="mb-8">
          <EmptyState>No referrals logged yet.</EmptyState>
        </Card>
      ) : (
        <div className="mb-8">
          <DataTable
            oneLine
            searchable
            searchPlaceholder="Search party or student…"
            exportFilename="referral-commissions"
            minTableWidthClassName="min-w-[1100px]"
            filters={[{ key: "status", label: "Status", options: ["Owed", "Paid"] }]}
            columns={[
              { key: "party", header: "Referring party" },
              { key: "student", header: "Student referred" },
              { key: "registered", header: "Registered" },
              { key: "amount", header: "Commission", align: "right", wrap: true },
              { key: "status", header: "Status" },
              { key: "paid_on", header: "Paid on" },
              { key: "method", header: "Method" },
              { key: "reference", header: "Reference" },
              { key: "action", header: "", exportable: false, wrap: true },
            ]}
            rows={rows.map((r) => {
              const party = r.referral_party_id ? partyById.get(r.referral_party_id) : null;
              const student = studentById.get(r.lead_id);
              const paid = r.incentive_status === "paid";
              const amountLabel = formatAmount(r.incentive_owed, r.currency ?? "PKR");
              return {
                id: r.id,
                cells: {
                  party: party ? (
                    <span className="font-medium text-ink">{party.full_name}</span>
                  ) : (
                    // Rows from before parties existed, if a name failed to
                    // match one. Shown, not hidden — it is still money owed.
                    <span className="text-muted">{r.referrer_name}</span>
                  ),
                  student: (
                    <Link href={`/students/${r.lead_id}`} className="text-primary hover:underline">
                      {student?.full_name ?? "Unknown student"}
                    </Link>
                  ),
                  registered: student?.registered_at ? String(student.registered_at).slice(0, 10) : "—",
                  amount:
                    canSetIncentives && !paid ? (
                      <IncentiveAmountInput id={r.id} amount={r.incentive_owed} />
                    ) : (
                      <span className="tabular-nums">{amountLabel}</span>
                    ),
                  status: <Badge tone={paid ? "success" : "warning"}>{paid ? "Paid" : "Owed"}</Badge>,
                  paid_on: r.paid_on ?? "—",
                  method: r.payment_method ?? "—",
                  reference: r.payment_reference ?? "—",
                  action: canSetIncentives ? (
                    <ReferralPaymentCell
                      id={r.id}
                      paid={paid}
                      partyName={party?.full_name ?? r.referrer_name}
                      amountLabel={amountLabel}
                      today={today}
                    />
                  ) : null,
                },
                csv: {
                  party: party?.full_name ?? r.referrer_name,
                  student: student?.full_name ?? "Unknown student",
                  registered: student?.registered_at ? String(student.registered_at).slice(0, 10) : "",
                  amount: r.incentive_owed === null ? "" : String(r.incentive_owed),
                  status: paid ? "Paid" : "Owed",
                  paid_on: r.paid_on ?? "",
                  method: r.payment_method ?? "",
                  reference: r.payment_reference ?? "",
                },
              };
            })}
          />
        </div>
      )}

      {/* -------------------------------------------- who we owe, per party */}
      <h3 className="mb-2 text-sm font-semibold text-ink">Referring parties</h3>
      {partyRows.length === 0 ? (
        <Card>
          <EmptyState>
            No referring parties on file yet. Add one, then log the students they referred.
          </EmptyState>
        </Card>
      ) : (
        <DataTable
          oneLine
          searchable
          searchPlaceholder="Search parties…"
          exportFilename="referring-parties"
          minTableWidthClassName="min-w-[1100px]"
          columns={[
            { key: "name", header: "Name" },
            { key: "organisation", header: "Organisation" },
            { key: "contact", header: "Contact" },
            { key: "city", header: "City" },
            { key: "bank", header: "Paid into" },
            { key: "referrals", header: "Referrals", align: "right" },
            { key: "owed", header: "Owed", align: "right" },
            { key: "paid", header: "Paid", align: "right" },
            { key: "last_paid", header: "Last paid" },
            { key: "action", header: "", exportable: false },
          ]}
          rows={partyRows.map((p) => {
            const b = (balances ?? []).find((x) => x.referral_party_id === p.id);
            const owed = Number(b?.amount_owed ?? 0);
            return {
              id: p.id,
              cells: {
                name: (
                  <span className={p.is_active ? "font-medium text-ink" : "text-muted"}>
                    {p.full_name}
                    {!p.is_active && <span className="ml-1 text-xs">(inactive)</span>}
                  </span>
                ),
                organisation: p.organisation ?? "—",
                contact: p.contact_number ?? p.email ?? "—",
                city: p.city ?? "—",
                // The account the money goes to, at a glance — the reason
                // this section keeps party records at all.
                bank: p.account_number ? `${p.bank_name ?? "Bank"} · ${p.account_number}` : "—",
                referrals: String(b?.referral_count ?? 0),
                owed: <span className={owed > 0 ? "font-medium tabular-nums text-warning" : "tabular-nums"}>{formatAmount(owed)}</span>,
                paid: <span className="tabular-nums">{formatAmount(Number(b?.amount_paid ?? 0))}</span>,
                last_paid: b?.last_paid_on ?? "—",
                action: canManage ? (
                  <ReferralPartyForm party={p} trigger={<Button type="button" size="sm">Edit</Button>} />
                ) : null,
              },
              csv: {
                name: p.full_name,
                organisation: p.organisation ?? "",
                contact: p.contact_number ?? p.email ?? "",
                city: p.city ?? "",
                bank: p.account_number ? `${p.bank_name ?? ""} ${p.account_number}` : "",
                referrals: String(b?.referral_count ?? 0),
                owed: String(owed),
                paid: String(Number(b?.amount_paid ?? 0)),
                last_paid: b?.last_paid_on ?? "",
              },
            };
          })}
        />
      )}

      {!canManage && (
        <p className="mt-3 text-xs text-muted">
          Referring parties and referrals are maintained by Finance, Accounts and Super Admin.
        </p>
      )}
    </div>
  );
}
