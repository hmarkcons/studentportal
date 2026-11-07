import Link from "next/link";
import { getStaffSession } from "@/lib/auth/session";
import { hasPermission } from "@/lib/auth/permissions";
import { createAdminClient } from "@/lib/supabase/admin";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { loadAudience } from "@/lib/emailCampaigns/audienceLoad";
import { resolveAudience } from "@/lib/emailCampaigns/audience";
import { EmailTabs, karachiTime } from "../../EmailTabs";
import { AudienceNav } from "../AudienceNav";
import { ListDetailsForm } from "./ListForms";

export default async function EmailListsPage() {
  const { supabase } = await getStaffSession();
  const [canManage, { data: lists }, audience] = await Promise.all([
    hasPermission("email.audience.manage"),
    supabase.from("email_lists").select("id, name, description, updated_at").order("name"),
    loadAudience(createAdminClient()),
  ]);

  return (
    <div className="w-full">
      <h2 className="mb-1 text-lg font-semibold text-ink">Email campaigns</h2>
      <p className="mb-4 text-sm text-muted">A list is a fixed set of people — leads, or contacts imported from a spreadsheet — added by hand or by import.</p>
      <EmailTabs active="audience" />
      <AudienceNav active="lists" />

      {canManage && (
        <Card className="mb-6">
          <h3 className="mb-3 text-sm font-medium text-ink">New list</h3>
          <ListDetailsForm />
        </Card>
      )}

      {!lists?.length ? (
        <EmptyState>No lists yet.</EmptyState>
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2" data-email-lists>
          {lists.map((l) => {
            const members = audience.contacts.filter((c) => c.lists.includes(l.id as string)).length;
            const reach = resolveAudience({ contacts: audience.contacts, include: { segments: [], lists: [l.id as string] }, statuses: audience.statuses }).counts.final;
            return (
              <Link key={l.id} prefetch={false} href={`/marketing/email/audience/lists/${l.id}`} className="group">
                <Card className="h-full transition-shadow group-hover:shadow-md">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm font-medium text-ink group-hover:text-primary">{l.name}</p>
                    <p className="text-lg font-semibold text-ink">{reach.toLocaleString("en-US")}</p>
                  </div>
                  {l.description && <p className="text-xs text-muted">{l.description}</p>}
                  <p className="mt-1 text-[11px] text-muted">
                    {members.toLocaleString("en-US")} on the list · {reach.toLocaleString("en-US")} reachable · updated {karachiTime(l.updated_at)}
                  </p>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
