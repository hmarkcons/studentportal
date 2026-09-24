import { Suspense } from "react";
import { getStaffSession } from "@/lib/auth/session";
import { hasRole } from "@/lib/auth/roles";
import { createAdminClient } from "@/lib/supabase/admin";
import { loadStaffQueue } from "@/lib/staffQueue";
import { StaffQueueCard } from "@/components/StaffQueueCard";
import { SectionTabs } from "@/components/SectionTabs";
import { Card } from "@/components/ui/Card";
import { pickView, viewsFor, VIEW_LABELS, type DashboardView } from "@/lib/dashboards/views";
import { scopeQueue } from "@/lib/dashboards/queueScope";
import { SalesView } from "./views/SalesView";
import { ProcessingView } from "./views/ProcessingView";
import { FinanceView } from "./views/FinanceView";
import { LeadGenView, SocialView } from "./views/MarketingViews";
import { OverviewView } from "./views/OverviewView";

/**
 * Each job's dashboard: what is waiting on this person first, then the
 * figures and charts for their role (src/lib/dashboards/views.ts). Someone
 * with several roles gets a tab for each, opening on their main role's.
 */
export default async function DashboardPage(props: { searchParams: Promise<{ view?: string }> }) {
  const [{ view: requested }, { supabase, staff }] = await Promise.all([props.searchParams, getStaffSession()]);
  const views = viewsFor(staff);
  const view = pickView(views, requested);

  // Scoped by RLS to what this person can see, then to what is their job.
  const queue = scopeQueue(await loadStaffQueue(supabase), staff);

  return (
    <div className="w-full">
      <h2 className="mb-4 text-lg font-semibold text-ink">Dashboard</h2>
      <StaffQueueCard queue={queue} />

      <SectionTabs tabs={views.map((v) => ({ key: v, label: VIEW_LABELS[v], href: `/dashboard?view=${v}` }))} active={view ?? ""} />

      {view && staff ? (
        // Streamed: the queue above is there at once, and a dashboard that
        // reads a year of leads does not hold it up.
        <Suspense key={view} fallback={<DashboardSkeleton />}>
          <ViewFor view={view} staff={staff} supabase={supabase} />
        </Suspense>
      ) : (
        <Card>
          <p className="text-sm text-muted">No dashboard for your role yet.</p>
        </Card>
      )}
    </div>
  );
}

type Session = Awaited<ReturnType<typeof getStaffSession>>;

async function ViewFor({ view, staff, supabase }: { view: DashboardView; staff: NonNullable<Session["staff"]>; supabase: Session["supabase"] }) {
  // Visa decisions and scholarships are readable only by Processing and Super
  // Admin. Management's team views read those two with the service role —
  // only here, after viewsFor has given them the view, and only as totals.
  const restricted = () => (hasRole(staff, "processing", "super_admin") ? supabase : createAdminClient());

  switch (view) {
    case "overview":
      return <OverviewView db={supabase} restricted={restricted()} />;
    case "sales":
      return <SalesView db={supabase} staffId={staff.id} team={false} />;
    case "sales_team":
      return <SalesView db={supabase} staffId={staff.id} team />;
    case "processing":
      return <ProcessingView db={supabase} restricted={supabase} staffId={staff.id} team={false} />;
    case "processing_team":
      return <ProcessingView db={supabase} restricted={restricted()} staffId={staff.id} team />;
    case "finance":
      return <FinanceView db={supabase} />;
    case "leadgen":
      return <LeadGenView db={supabase} />;
    case "social":
      return <SocialView db={supabase} />;
  }
}

function DashboardSkeleton() {
  return (
    <div className="flex flex-col gap-4" aria-busy="true" aria-label="Loading the dashboard">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-24 animate-pulse rounded-lg border border-border bg-card" />
        ))}
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {[0, 1].map((i) => (
          <div key={i} className="h-56 animate-pulse rounded-lg border border-border bg-card" />
        ))}
      </div>
    </div>
  );
}
