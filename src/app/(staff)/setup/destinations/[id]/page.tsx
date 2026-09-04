import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/Card";
import { StagesForm } from "./StagesForm";
import { DashboardStagesForm } from "./DashboardStagesForm";
import { DestinationEditForm } from "./DestinationEditForm";
import { formatDashboardStagesText, type DashboardStageDef } from "@/lib/dashboardPipeline";

export default async function DestinationDetailPage(props: PageProps<"/setup/destinations/[id]">) {
  const { id } = await props.params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: staffRow } = await supabase.from("staff").select("role").eq("id", user?.id ?? "").maybeSingle();
  const isSuperAdmin = staffRow?.role === "super_admin";

  const { data: destination, error } = await supabase.from("destinations").select("*").eq("id", id).maybeSingle();
  if (error || !destination) notFound();

  const { data: universities } = await supabase.from("universities").select("id, name").eq("destination_id", id);

  return (
    <div className="w-full">
      <Link href="/setup/destinations" className="text-sm text-muted hover:text-ink">
        &larr; Back to destinations
      </Link>
      <h2 className="mt-2 mb-6 text-xl font-semibold text-ink">{destination.display_name}</h2>

      <Card className="mb-6">
        <h3 className="mb-3 text-sm font-medium text-ink">Details & fees</h3>
        {isSuperAdmin ? (
          <DestinationEditForm destination={destination} />
        ) : (
          <p className="text-sm text-muted">
            {destination.track} · {destination.currency} · Admin charge: {destination.admin_charge}{" "}
            {destination.consultancy_fee_currency} · Consultancy fee: {destination.consultancy_fee}{" "}
            {destination.consultancy_fee_currency}
            {destination.visa_type ? ` · Visa: ${destination.visa_type}` : ""}
            {destination.installment_plan ? ` · Installment plan: ${destination.installment_plan}` : ""}
            <br />
            Only Super Admin can edit or delete destinations.
          </p>
        )}
      </Card>

      <Card className="mb-6">
        <h3 className="mb-3 text-sm font-medium text-ink">University application pipeline stages</h3>
        <p className="mb-3 text-xs text-muted">Tracks a single application&apos;s progress at one university.</p>
        {isSuperAdmin ? (
          <StagesForm destinationId={id} stages={destination.pipeline_stages as string[]} />
        ) : (
          <p className="text-sm text-muted">{(destination.pipeline_stages as string[]).join(", ")}</p>
        )}
      </Card>

      <Card className="mb-6">
        <h3 className="mb-3 text-sm font-medium text-ink">Dashboard pipeline stages</h3>
        <p className="mb-3 text-xs text-muted">Tracks a registered student&apos;s overall progress toward this country, shown on their Dashboard.</p>
        {isSuperAdmin ? (
          <DashboardStagesForm destinationId={id} stages={(destination.dashboard_pipeline_stages as DashboardStageDef[]) ?? []} />
        ) : (
          <p className="text-sm text-muted">{formatDashboardStagesText((destination.dashboard_pipeline_stages as DashboardStageDef[]) ?? [])}</p>
        )}
      </Card>

      <Card>
        <h3 className="mb-3 text-sm font-medium text-ink">Universities in this destination</h3>
        <div className="flex flex-col divide-y divide-border">
          {(universities ?? []).map((u) => (
            <Link key={u.id} href={`/setup/universities/${u.id}`} className="py-2 text-sm text-ink hover:text-primary">
              {u.name}
            </Link>
          ))}
          {(!universities || universities.length === 0) && <p className="py-2 text-sm text-muted">No universities yet.</p>}
        </div>
      </Card>
    </div>
  );
}
