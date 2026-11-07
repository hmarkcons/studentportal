import Link from "next/link";
import { getStaffSession } from "@/lib/auth/session";
import { hasPermission } from "@/lib/auth/permissions";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { CONTACT_STATUS_LABELS, type ContactStatus } from "@/lib/emailCampaigns/audience";
import { EmailTabs, karachiTime } from "../../EmailTabs";
import { AudienceNav } from "../AudienceNav";
import { RestoreAddressButton, SuppressForm } from "./SuppressForms";

const PAGE = 200;
const TONE = { subscribed: "success", unsubscribed: "neutral", bounced: "danger", complained: "danger", suppressed: "warning", invalid: "warning" } as const;

// Everyone no campaign will reach, and why. It wins over every segment and list.
export default async function EmailSuppressedPage(props: { searchParams: Promise<{ page?: string; status?: string }> }) {
  const sp = await props.searchParams;
  const page = Math.max(1, Number(sp.page) || 1);
  const filter = (["unsubscribed", "bounced", "complained", "suppressed", "invalid"] as const).find((s) => s === sp.status) ?? null;
  const { supabase } = await getStaffSession();
  let query = supabase
    .from("email_contact_status")
    .select("email, status, status_reason, status_changed_at", { count: "exact" })
    .neq("status", "subscribed")
    .order("status_changed_at", { ascending: false })
    .range((page - 1) * PAGE, page * PAGE - 1);
  if (filter) query = query.eq("status", filter);
  const [canManage, { data: rows, count }] = await Promise.all([hasPermission("email.audience.manage"), query]);
  const total = count ?? 0;
  const pages = Math.max(1, Math.ceil(total / PAGE));

  return (
    <div className="w-full">
      <h2 className="mb-1 text-lg font-semibold text-ink">Email campaigns</h2>
      <p className="mb-4 text-sm text-muted">
        No campaign reaches these addresses, whatever segment or list they are in. People who unsubscribed or marked an
        email as spam can only undo that themselves, from their preferences page.
      </p>
      <EmailTabs active="audience" />
      <AudienceNav active="suppressed" />

      {canManage && (
        <Card className="mb-6">
          <h3 className="mb-3 text-sm font-medium text-ink">Add to the do-not-email list</h3>
          <SuppressForm />
        </Card>
      )}

      <Card>
        <div className="mb-3 flex flex-wrap items-center gap-1 text-xs">
          <Link prefetch={false} href="?" className={`rounded-md px-2 py-1 ${!filter ? "bg-primary text-primary-ink" : "border border-border text-ink"}`}>
            All ({filter ? "…" : total})
          </Link>
          {(["unsubscribed", "bounced", "complained", "suppressed", "invalid"] as const).map((s) => (
            <Link key={s} prefetch={false} href={`?status=${s}`} className={`rounded-md px-2 py-1 ${filter === s ? "bg-primary text-primary-ink" : "border border-border text-ink"}`}>
              {CONTACT_STATUS_LABELS[s]}
            </Link>
          ))}
        </div>
        {!rows?.length ? (
          <EmptyState>No one here.</EmptyState>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs" data-suppressed-list>
              <thead className="text-muted">
                <tr>
                  <th className="py-1 pr-3 font-medium">Email</th>
                  <th className="py-1 pr-3 font-medium">Status</th>
                  <th className="py-1 pr-3 font-medium">Why</th>
                  <th className="py-1 pr-3 font-medium">Since</th>
                  <th className="py-1" />
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rows.map((r) => (
                  <tr key={r.email as string}>
                    <td className="break-all py-1.5 pr-3 text-ink">{r.email as string}</td>
                    <td className="py-1.5 pr-3">
                      <Badge tone={TONE[r.status as ContactStatus]}>{CONTACT_STATUS_LABELS[r.status as ContactStatus]}</Badge>
                    </td>
                    <td className="py-1.5 pr-3 text-muted">{(r.status_reason as string) ?? "—"}</td>
                    <td className="py-1.5 pr-3 text-muted">{karachiTime(r.status_changed_at as string)}</td>
                    <td className="py-1.5 text-right">
                      {canManage && ["suppressed", "invalid", "bounced"].includes(r.status as string) && <RestoreAddressButton email={r.email as string} />}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {pages > 1 && (
          <div className="mt-3 flex items-center gap-3 text-xs">
            {page > 1 && (
              <Link prefetch={false} href={`?page=${page - 1}${filter ? `&status=${filter}` : ""}`} className="text-primary hover:underline">
                ← Previous
              </Link>
            )}
            <span className="text-muted">
              Page {page} of {pages}
            </span>
            {page < pages && (
              <Link prefetch={false} href={`?page=${page + 1}${filter ? `&status=${filter}` : ""}`} className="text-primary hover:underline">
                Next →
              </Link>
            )}
          </div>
        )}
      </Card>
    </div>
  );
}
