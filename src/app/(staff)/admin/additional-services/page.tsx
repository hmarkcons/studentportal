import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { NewServiceRequestForm } from "./NewServiceRequestForm";

function one<T>(v: T | T[] | null) {
  return Array.isArray(v) ? v[0] ?? null : v;
}

export default async function AdditionalServicesPage() {
  const supabase = await createClient();
  const { data: students } = await supabase.from("students").select("id, full_name").order("full_name");
  const { data: requests } = await supabase
    .from("additional_service_requests")
    .select("id, service_type, country_applying_to, total_fee_paid, documents_received, student:leads(full_name)")
    .order("created_at", { ascending: false });

  return (
    <div className="mx-auto max-w-4xl">
      <h2 className="mb-4 text-lg font-semibold text-ink">Additional Services</h2>
      <Card className="mb-6">
        <NewServiceRequestForm students={students ?? []} />
      </Card>

      <div className="flex flex-col divide-y divide-border rounded-lg border border-border bg-card">
        {(requests ?? []).map((r) => (
          <div key={r.id} className="flex items-center justify-between px-4 py-3 text-sm">
            <div>
              <p className="text-ink">
                {one(r.student)?.full_name} · {r.service_type.replace(/_/g, " ")}
              </p>
              <p className="text-xs text-muted">{r.country_applying_to ?? "—"}</p>
            </div>
            <Badge tone={r.documents_received ? "success" : "warning"}>{r.documents_received ? "Docs received" : "Pending docs"}</Badge>
          </div>
        ))}
        {(!requests || requests.length === 0) && <p className="px-4 py-6 text-sm text-muted">No requests yet.</p>}
      </div>
    </div>
  );
}
