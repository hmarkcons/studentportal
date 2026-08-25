import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { NewServiceRequestForm } from "./NewServiceRequestForm";
import { ADDITIONAL_SERVICE_LABELS, ADDITIONAL_SERVICE_FIELDS } from "@/lib/additionalServiceFields";

function one<T>(v: T | T[] | null) {
  return Array.isArray(v) ? v[0] ?? null : v;
}

type RequestRow = {
  id: string;
  service_type: string;
  country_applying_to: string | null;
  total_fee_paid: number | null;
  documents_received: boolean;
  delivery_date: string | null;
  extra_fields: Record<string, string | boolean>;
  student: { full_name: string } | { full_name: string }[] | null;
};

export default async function AdditionalServicesPage() {
  const supabase = await createClient();
  const { data: students } = await supabase.from("students").select("id, full_name").order("full_name");
  const { data: requests } = await supabase
    .from("additional_service_requests")
    .select("id, service_type, country_applying_to, total_fee_paid, documents_received, delivery_date, extra_fields, student:leads(full_name)")
    .order("created_at", { ascending: false })
    .returns<RequestRow[]>();

  return (
    <div className="mx-auto max-w-4xl">
      <h2 className="mb-4 text-lg font-semibold text-ink">Additional Services</h2>
      <Card className="mb-6">
        <NewServiceRequestForm students={students ?? []} />
      </Card>

      <div className="flex flex-col divide-y divide-border rounded-lg border border-border bg-card">
        {(requests ?? []).map((r) => {
          // Surface whichever type-specific field looks like a status, since
          // it varies by service (ibcc/cimea use "status", hec uses its own
          // verification-status key, others have none at all).
          const statusKey = ADDITIONAL_SERVICE_FIELDS[r.service_type]?.find((f) => f.key.includes("status"))?.key;
          const statusValue = statusKey ? r.extra_fields?.[statusKey] : null;

          return (
            <div key={r.id} className="flex items-center justify-between px-4 py-3 text-sm">
              <div>
                <p className="text-ink">
                  {one(r.student)?.full_name} · {ADDITIONAL_SERVICE_LABELS[r.service_type] ?? r.service_type}
                </p>
                <p className="text-xs text-muted">
                  {r.country_applying_to ?? "—"}
                  {r.delivery_date ? ` · Delivery ${new Date(r.delivery_date).toLocaleDateString()}` : ""}
                  {r.total_fee_paid ? ` · Rs ${r.total_fee_paid}` : ""}
                </p>
              </div>
              <div className="flex items-center gap-2">
                {typeof statusValue === "string" && statusValue && (
                  <Badge tone="info">{statusValue.replace(/_/g, " ")}</Badge>
                )}
                <Badge tone={r.documents_received ? "success" : "warning"}>
                  {r.documents_received ? "Docs received" : "Pending docs"}
                </Badge>
              </div>
            </div>
          );
        })}
        {(!requests || requests.length === 0) && <p className="px-4 py-6 text-sm text-muted">No requests yet.</p>}
      </div>
    </div>
  );
}
