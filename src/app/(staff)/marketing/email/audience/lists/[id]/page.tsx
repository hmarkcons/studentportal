import Link from "next/link";
import { notFound } from "next/navigation";
import { getStaffSession } from "@/lib/auth/session";
import { hasPermission } from "@/lib/auth/permissions";
import { createAdminClient } from "@/lib/supabase/admin";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { CONTACT_STATUS_LABELS, normalizeEmail, type ContactStatus } from "@/lib/emailCampaigns/audience";
import { EmailTabs, karachiTime } from "../../../EmailTabs";
import { AudienceNav } from "../../AudienceNav";
import { DeleteListButton, ListDetailsForm, PasteToListForm, RemoveMemberButton } from "../ListForms";

const PAGE = 100;
const TONE = { subscribed: "success", unsubscribed: "neutral", bounced: "danger", complained: "danger", suppressed: "warning", invalid: "warning" } as const;
type Person = { full_name: string | null; email: string | null };
const one = <T,>(v: T | T[] | null): T | null => (Array.isArray(v) ? (v[0] ?? null) : v);

export default async function EmailListPage(props: { params: Promise<{ id: string }>; searchParams: Promise<{ page?: string }> }) {
  const { id } = await props.params;
  const page = Math.max(1, Number((await props.searchParams).page) || 1);
  const { supabase } = await getStaffSession();
  // Members are read across all leads: a list is the office's, not one counsellor's slice.
  const admin = createAdminClient();
  const [canManage, { data: list }, { data: members, count }] = await Promise.all([
    hasPermission("email.audience.manage"),
    supabase.from("email_lists").select("id, name, description, created_at").eq("id", id).maybeSingle(),
    admin
      .from("email_list_members")
      .select("id, added_at, lead_id, contact_id, lead:leads(full_name, email), contact:email_contacts(full_name, email)", { count: "exact" })
      .eq("list_id", id)
      .order("added_at", { ascending: false })
      .range((page - 1) * PAGE, page * PAGE - 1),
  ]);
  if (!list) notFound();

  const rows = (members ?? []).map((m) => {
    const who = (one(m.lead as never) as Person | null) ?? (one(m.contact as never) as Person | null);
    return { id: m.id as string, addedAt: m.added_at as string, kind: m.lead_id ? "lead" : "imported", name: who?.full_name ?? "—", email: normalizeEmail(who?.email) };
  });
  const emails = rows.map((r) => r.email).filter((e): e is string => Boolean(e));
  const { data: states } = await admin.from("email_contact_status").select("email, status").in("email", emails.length ? emails : ["-"]);
  const stateOf = new Map((states ?? []).map((s) => [s.email as string, s.status as ContactStatus]));
  const total = count ?? 0;
  const pages = Math.max(1, Math.ceil(total / PAGE));

  return (
    <div className="w-full">
      <Link prefetch={false} href="/marketing/email/audience/lists" className="mb-2 inline-block text-xs text-primary hover:underline">
        ← All lists
      </Link>
      <h2 className="mb-1 text-lg font-semibold text-ink">{list.name}</h2>
      {list.description && <p className="mb-3 text-sm text-muted">{list.description}</p>}
      <EmailTabs active="audience" />
      <AudienceNav active="lists" />

      {canManage && (
        <div className="mb-6 grid grid-cols-1 gap-6 xl:grid-cols-2">
          <Card>
            <h3 className="mb-3 text-sm font-medium text-ink">Add people</h3>
            <PasteToListForm listId={list.id} />
            <p className="mt-3 text-xs text-muted">
              For a spreadsheet, use{" "}
              <Link prefetch={false} href="/marketing/email/audience/import" className="text-primary hover:underline">
                Import
              </Link>
              .
            </p>
          </Card>
          <Card>
            <h3 className="mb-3 text-sm font-medium text-ink">List details</h3>
            <ListDetailsForm listId={list.id} name={list.name} description={list.description ?? ""} />
            <div className="mt-4">
              <DeleteListButton listId={list.id} />
            </div>
          </Card>
        </div>
      )}

      <Card>
        <h3 className="mb-3 text-sm font-medium text-ink">{total.toLocaleString("en-US")} on the list</h3>
        {rows.length === 0 ? (
          <EmptyState>No one on this list yet.</EmptyState>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs" data-list-members>
              <thead className="text-muted">
                <tr>
                  <th className="py-1 pr-3 font-medium">Name</th>
                  <th className="py-1 pr-3 font-medium">Email</th>
                  <th className="py-1 pr-3 font-medium">Type</th>
                  <th className="py-1 pr-3 font-medium">Email status</th>
                  <th className="py-1 pr-3 font-medium">Added</th>
                  <th className="py-1" />
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rows.map((r) => {
                  const status: ContactStatus = r.email ? (stateOf.get(r.email) ?? "subscribed") : "invalid";
                  return (
                    <tr key={r.id}>
                      <td className="py-1.5 pr-3 text-ink">{r.name}</td>
                      <td className="break-all py-1.5 pr-3 text-muted">{r.email ?? "—"}</td>
                      <td className="py-1.5 pr-3 text-muted">{r.kind}</td>
                      <td className="py-1.5 pr-3">
                        <Badge tone={TONE[status]}>{CONTACT_STATUS_LABELS[status]}</Badge>
                      </td>
                      <td className="py-1.5 pr-3 text-muted">{karachiTime(r.addedAt)}</td>
                      <td className="py-1.5 text-right">{canManage && <RemoveMemberButton listId={list.id} memberId={r.id} />}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {pages > 1 && (
          <div className="mt-3 flex items-center gap-3 text-xs">
            {page > 1 && (
              <Link prefetch={false} href={`?page=${page - 1}`} className="text-primary hover:underline">
                ← Previous
              </Link>
            )}
            <span className="text-muted">
              Page {page} of {pages}
            </span>
            {page < pages && (
              <Link prefetch={false} href={`?page=${page + 1}`} className="text-primary hover:underline">
                Next →
              </Link>
            )}
          </div>
        )}
      </Card>
    </div>
  );
}
