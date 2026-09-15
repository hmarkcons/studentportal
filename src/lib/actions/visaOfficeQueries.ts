import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { VisaOffice, VisaOfficeKind } from "@/lib/visaOffices";

/**
 * The offices for a set of destinations, keyed by destination id.
 *
 * One query for however many countries a student is going to, rather than one
 * per card — a student with Italy and Germany finalised would otherwise cost
 * two round trips to render one page.
 */
export async function loadVisaOffices(destinationIds: string[]): Promise<Record<string, VisaOffice[]>> {
  if (destinationIds.length === 0) return {};
  const supabase = await createClient();

  const { data } = await supabase
    .from("visa_offices")
    .select(
      "id, destination_id, kind, name, city, operator, address, phone, email, website, appointment_url, office_hours, jurisdiction, submits_applications, notes, source_url, verified_at"
    )
    .in("destination_id", destinationIds)
    .eq("status", "active")
    .order("sort_order");

  const byDestination: Record<string, VisaOffice[]> = {};
  for (const row of data ?? []) {
    const list = byDestination[row.destination_id] ?? [];
    list.push({
      id: row.id,
      kind: row.kind as VisaOfficeKind,
      name: row.name,
      city: row.city,
      operator: row.operator,
      address: row.address,
      phone: row.phone,
      email: row.email,
      website: row.website,
      appointmentUrl: row.appointment_url,
      officeHours: row.office_hours,
      jurisdiction: row.jurisdiction,
      submitsApplications: Boolean(row.submits_applications),
      notes: row.notes,
      sourceUrl: row.source_url,
      verifiedAt: row.verified_at,
    });
    byDestination[row.destination_id] = list;
  }
  return byDestination;
}
