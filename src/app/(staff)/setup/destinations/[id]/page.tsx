import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/Card";
import { StagesForm } from "./StagesForm";
import { DestinationEditForm } from "./DestinationEditForm";

export default async function DestinationDetailPage(props: PageProps<"/setup/destinations/[id]">) {
  const { id } = await props.params;
  const supabase = await createClient();

  const { data: destination, error } = await supabase.from("destinations").select("*").eq("id", id).maybeSingle();
  if (error || !destination) notFound();

  const { data: universities } = await supabase.from("universities").select("id, name").eq("destination_id", id);

  return (
    <div className="mx-auto max-w-2xl">
      <Link href="/setup/destinations" className="text-sm text-muted hover:text-ink">
        &larr; Back to destinations
      </Link>
      <h2 className="mt-2 mb-6 text-xl font-semibold text-ink">{destination.display_name}</h2>

      <Card className="mb-6">
        <h3 className="mb-3 text-sm font-medium text-ink">Details & fees</h3>
        <DestinationEditForm destination={destination} />
      </Card>

      <Card className="mb-6">
        <h3 className="mb-3 text-sm font-medium text-ink">Application pipeline stages</h3>
        <StagesForm destinationId={id} stages={destination.pipeline_stages as string[]} />
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
