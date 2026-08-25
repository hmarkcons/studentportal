import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { NewDestinationForm } from "./NewDestinationForm";

export default async function DestinationsPage() {
  const supabase = await createClient();
  const { data: destinations } = await supabase.from("destinations").select("id, display_name, country, track, status").order("display_name");

  return (
    <div className="mx-auto max-w-3xl">
      <h2 className="mb-4 text-lg font-semibold text-ink">Destinations</h2>
      <Card className="mb-6">
        <NewDestinationForm />
      </Card>
      <div className="flex flex-col divide-y divide-border rounded-lg border border-border bg-card">
        {(destinations ?? []).map((d) => (
          <Link key={d.id} href={`/setup/destinations/${d.id}`} className="flex items-center justify-between px-4 py-3 text-sm hover:bg-bg">
            <span className="text-ink">{d.display_name}</span>
            <Badge tone={d.status === "active" ? "success" : "neutral"}>{d.status}</Badge>
          </Link>
        ))}
        {(!destinations || destinations.length === 0) && <p className="px-4 py-6 text-sm text-muted">No destinations yet.</p>}
      </div>
    </div>
  );
}
