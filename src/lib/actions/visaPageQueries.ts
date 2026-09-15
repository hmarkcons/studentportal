import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { VisaMessageFields, VisaPageSection } from "@/lib/visaPage";

/**
 * Everything the builder controls, for however many countries a student has.
 *
 * Fetched in one go rather than per country: the sections table holds the
 * shared rows too, and they are needed whichever destinations turn up.
 */
export async function loadVisaPageContent(destinationIds: string[]): Promise<{
  sections: VisaPageSection[];
  shared: VisaMessageFields | null;
  overrides: Record<string, VisaMessageFields>;
}> {
  const supabase = await createClient();

  const [{ data: sectionRows }, { data: shared }, { data: overrideRows }] = await Promise.all([
    supabase
      .from("visa_page_sections")
      .select("id, destination_id, title, body, link_label, link_url, audience, sort_order, status")
      .eq("status", "active")
      .order("sort_order"),
    supabase
      .from("visa_messages")
      .select("approved_heading, approved_body, approved_signoff, refused_heading, refused_body, refused_signoff")
      .eq("id", true)
      .maybeSingle(),
    destinationIds.length
      ? supabase
          .from("visa_destination_messages")
          .select(
            "destination_id, approved_heading, approved_body, approved_signoff, refused_heading, refused_body, refused_signoff"
          )
          .in("destination_id", destinationIds)
      : Promise.resolve({ data: [] as Record<string, never>[] }),
  ]);

  const sections: VisaPageSection[] = (sectionRows ?? []).map((r) => ({
    id: r.id,
    destinationId: r.destination_id,
    title: r.title,
    body: r.body,
    linkLabel: r.link_label,
    linkUrl: r.link_url,
    audience: r.audience as VisaPageSection["audience"],
    sortOrder: r.sort_order,
    status: r.status as VisaPageSection["status"],
  }));

  const overrides: Record<string, VisaMessageFields> = {};
  for (const row of (overrideRows ?? []) as (VisaMessageFields & { destination_id: string })[]) {
    const { destination_id, ...fields } = row;
    overrides[destination_id] = fields;
  }

  return { sections, shared: (shared as VisaMessageFields | null) ?? null, overrides };
}
