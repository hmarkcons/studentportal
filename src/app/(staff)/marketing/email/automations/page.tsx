import Link from "next/link";
import { getStaffSession } from "@/lib/auth/session";
import { hasPermission } from "@/lib/auth/permissions";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { TRIGGERS, type Trigger } from "@/lib/emailCampaigns/journeys";
import { EmailTabs, karachiTime } from "../EmailTabs";
import { NewJourneyForm } from "./JourneyClient";

const STATUS = { draft: { label: "Draft", tone: "neutral" }, active: { label: "On", tone: "success" }, paused: { label: "Paused", tone: "warning" } } as const;

/** Automations (Phase 6, 0364): journeys of emails that start by themselves. */
export default async function AutomationsPage() {
  const { supabase } = await getStaffSession();
  const [canCreate, { data: journeys }, { data: counts }] = await Promise.all([
    hasPermission("email.campaigns.create"),
    supabase.from("email_journeys").select("id, name, trigger, status, activated_at, created_at").order("created_at", { ascending: false }),
    supabase.from("email_journey_enrolments").select("journey_id, status"),
  ]);
  const tally = new Map<string, { active: number; done: number }>();
  for (const e of counts ?? []) {
    const t = tally.get(e.journey_id as string) ?? { active: 0, done: 0 };
    if (e.status === "active") t.active += 1;
    else t.done += 1;
    tally.set(e.journey_id as string, t);
  }
  const list = journeys ?? [];
  return (
    <div className="w-full">
      <h2 className="mb-1 text-lg font-semibold text-ink">Email campaigns</h2>
      <p className="mb-4 text-sm text-muted">
        Automations send a series of emails by themselves when something happens — a new lead, an application reaching a stage, documents still owed,
        an appointment or interview coming up.
      </p>
      <EmailTabs active="automations" />
      {canCreate && (
        <Card className="mb-6">
          <NewJourneyForm />
        </Card>
      )}
      {!list.length ? (
        <EmptyState>No automations yet.</EmptyState>
      ) : (
        <Card>
          <table className="w-full text-left text-xs" data-journey-list>
            <thead className="text-muted">
              <tr>
                <th className="py-1 pr-3 font-medium">Automation</th>
                <th className="py-1 pr-3 font-medium">Starts when</th>
                <th className="py-1 pr-3 font-medium">Status</th>
                <th className="py-1 pr-3 text-right font-medium">On it now</th>
                <th className="py-1 pr-3 text-right font-medium">Finished or left</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {list.map((j) => {
                const st = STATUS[j.status as keyof typeof STATUS] ?? STATUS.draft;
                const t = tally.get(j.id as string) ?? { active: 0, done: 0 };
                return (
                  <tr key={j.id as string}>
                    <td className="py-2 pr-3">
                      <Link prefetch={false} href={`/marketing/email/automations/${j.id}`} className="font-medium text-ink hover:text-primary">
                        {j.name as string}
                      </Link>
                      <p className="text-muted">{j.activated_at ? `On since ${karachiTime(j.activated_at as string)}` : `Made ${karachiTime(j.created_at as string)}`}</p>
                    </td>
                    <td className="py-2 pr-3 text-ink">{TRIGGERS[j.trigger as Trigger]?.label ?? (j.trigger as string)}</td>
                    <td className="py-2 pr-3">
                      <Badge tone={st.tone}>{st.label}</Badge>
                    </td>
                    <td className="py-2 pr-3 text-right text-ink">{t.active.toLocaleString("en-US")}</td>
                    <td className="py-2 pr-3 text-right text-ink">{t.done.toLocaleString("en-US")}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}
