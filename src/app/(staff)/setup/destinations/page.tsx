import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { NewDestinationForm } from "./NewDestinationForm";
import { ImportDestinationsForm } from "./ImportDestinationsForm";
import { DeleteDestinationIcon } from "./DeleteDestinationIcon";

export default async function DestinationsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: staffRow } = await supabase.from("staff").select("role").eq("id", user?.id ?? "").maybeSingle();
  const isSuperAdmin = staffRow?.role === "super_admin";

  const { data: destinations } = await supabase.from("destinations").select("id, display_name, country, track, status").order("display_name");

  return (
    <div className="w-full">
      <h2 className="mb-4 text-lg font-semibold text-ink">Destinations</h2>
      <Card className="mb-6">
        <NewDestinationForm />
        <ImportDestinationsForm />
      </Card>
      <div className="flex flex-col divide-y divide-border rounded-lg border border-border bg-card">
        {(destinations ?? []).map((d) => (
          <div key={d.id} className="flex items-center justify-between px-4 py-3 text-sm hover:bg-bg">
            <Link href={`/setup/destinations/${d.id}`} className="flex flex-1 items-center gap-3 text-ink">
              <span>{d.display_name}</span>
              <Badge tone={d.status === "active" ? "success" : "neutral"}>{d.status}</Badge>
            </Link>
            {isSuperAdmin && (
              <div className="flex items-center gap-1">
                <Link
                  href={`/setup/destinations/${d.id}`}
                  title="Edit destination"
                  aria-label="Edit destination"
                  className="rounded p-1 text-muted hover:bg-bg hover:text-primary"
                >
                  ✏️
                </Link>
                <DeleteDestinationIcon id={d.id} name={d.display_name} />
              </div>
            )}
          </div>
        ))}
        {(!destinations || destinations.length === 0) && <p className="px-4 py-6 text-sm text-muted">No destinations yet.</p>}
      </div>
    </div>
  );
}
