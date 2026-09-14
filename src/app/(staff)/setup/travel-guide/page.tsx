import { redirect } from "next/navigation";
import { getStaffSession } from "@/lib/auth/session";
import { hasPermission } from "@/lib/auth/permissions";
import { Card } from "@/components/ui/Card";
import { DestinationPicker } from "./DestinationPicker";
import { TravelGuideEditor, type EditorSection } from "./TravelGuideEditor";

export const dynamic = "force-dynamic";

export default async function TravelGuidePage(props: { searchParams: Promise<{ destination?: string }> }) {
  const { destination } = await props.searchParams;
  const { supabase, staff } = await getStaffSession();
  if (!staff) redirect("/");
  const canEdit = await hasPermission("settings.travel_guide");

  const [{ data: destinations }, { data: allSections }] = await Promise.all([
    supabase.from("destinations").select("id, display_name").order("display_name"),
    supabase.from("travel_guide_sections").select("id, destination_id"),
  ]);

  const selectedId = destination && (destinations ?? []).some((d) => d.id === destination) ? destination : "";
  const selected = (destinations ?? []).find((d) => d.id === selectedId) ?? null;

  let initial: EditorSection[] = [];
  if (selected) {
    const { data: sections } = await supabase
      .from("travel_guide_sections")
      .select("id, title, intro, sort_order, items:travel_guide_items(id, label, detail, days_after_arrival, sort_order)")
      .eq("destination_id", selected.id)
      .order("sort_order");

    // How many students have ticked each step, so removing one is a decision
    // taken with the number in front of you rather than discovered later.
    const itemIds = (sections ?? []).flatMap((s) =>
      ((s.items ?? []) as { id: string }[]).map((i) => i.id)
    );
    const { data: checks } = itemIds.length
      ? await supabase.from("student_travel_checks").select("item_id").in("item_id", itemIds)
      : { data: [] as { item_id: string }[] };
    const tickCounts = new Map<string, number>();
    for (const c of checks ?? []) tickCounts.set(c.item_id, (tickCounts.get(c.item_id) ?? 0) + 1);

    initial = (sections ?? []).map((s) => ({
      id: s.id as string,
      title: (s.title as string) ?? "",
      intro: (s.intro as string) ?? "",
      items: ((s.items ?? []) as { id: string; label: string; detail: string | null; days_after_arrival: number | null; sort_order: number }[])
        .slice()
        .sort((a, b) => a.sort_order - b.sort_order)
        .map((i) => ({
          id: i.id,
          label: i.label ?? "",
          detail: i.detail ?? "",
          daysAfterArrival: i.days_after_arrival == null ? "" : String(i.days_after_arrival),
          tickedBy: tickCounts.get(i.id) ?? 0,
        })),
    }));
  }

  return (
    <div className="w-full max-w-4xl">
      <h2 className="mb-1 text-lg font-semibold text-ink">Travel &amp; arrival guides</h2>
      <p className="mb-5 text-sm text-muted">
        What a student should carry with them and do once they land. A student sees their country&rsquo;s guide on their
        own <strong className="font-medium text-ink">Travel &amp; Arrival</strong> tab only after their visa is issued —
        a refused student never sees it — and they can tick each step off as they go.
      </p>

      <DestinationPicker
        destinations={(destinations ?? []).map((d) => ({
          id: d.id,
          display_name: d.display_name,
          sections: (allSections ?? []).filter((s) => s.destination_id === d.id).length,
        }))}
        selected={selectedId}
      />

      {!selected ? (
        <Card className="mt-6">
          <p className="text-sm text-muted">
            Pick a destination above. Italy already has a starting guide — read it and correct anything that does not
            match what our students actually run into, because they will follow it.
          </p>
        </Card>
      ) : (
        <>
          {!canEdit && (
            <p className="mt-5 rounded-md border border-border bg-surface-2 px-3 py-2 text-xs text-muted">
              You can read this guide but not change it.
            </p>
          )}
          <TravelGuideEditor
            key={selected.id}
            destinationId={selected.id}
            destinationLabel={selected.display_name}
            initial={initial}
            canEdit={canEdit}
          />
        </>
      )}
    </div>
  );
}
