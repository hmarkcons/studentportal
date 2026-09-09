import { redirect } from "next/navigation";
import { getStaffSession } from "@/lib/auth/session";
import { hasPermission } from "@/lib/auth/permissions";
import { Card } from "@/components/ui/Card";
import { resolveChecklist, type TemplateRow } from "@/lib/documentChecklist";
import { ChecklistBuilder } from "./ChecklistBuilder";
import { DestinationPicker } from "./DestinationPicker";

export default async function CreateDocChecklistPage(props: {
  searchParams: Promise<{ destination?: string }>;
}) {
  const { destination } = await props.searchParams;
  const { supabase, staff } = await getStaffSession();
  if (!staff) redirect("/");
  if (!(await hasPermission("document_checklist.manage"))) redirect("/dashboard");

  const [{ data: destinations }, { data: sections }, { data: destinationSections }, { data: templates }] =
    await Promise.all([
      supabase.from("destinations").select("id, display_name, country_code, track").order("display_name"),
      supabase.from("document_sections").select("key, label, is_predefined, sort_order").order("sort_order"),
      supabase.from("destination_document_sections").select("destination_id, section_key, sort_order"),
      supabase
        .from("document_templates")
        .select("id, destination_id, category, name, description, required, level, sort_order")
        .order("sort_order"),
    ]);

  // "all" is the All-destinations checklist — an entry in the picker like any
  // country, because that is where a shared requirement is edited. Nothing is
  // selected on first load, so the page opens on a choice rather than on some
  // arbitrary country's list.
  const selectedId = destination === "all" ? null : (destination ?? undefined);
  const selectedDestination = selectedId ? (destinations ?? []).find((d) => d.id === selectedId) : null;
  const hasSelection = destination === "all" || Boolean(selectedDestination);

  const { data: exclusions } = selectedId
    ? await supabase.from("destination_document_exclusions").select("template_id").eq("destination_id", selectedId)
    : { data: [] };

  const checklist = hasSelection
    ? resolveChecklist({
        destinationId: selectedId ?? null,
        sections: sections ?? [],
        destinationSections: destinationSections ?? [],
        templates: (templates ?? []) as TemplateRow[],
        excludedTemplateIds: (exclusions ?? []).map((e) => e.template_id),
      })
    : [];

  // Excluded shared items are listed apart so a destination that has dropped
  // one can put it back — a removal you cannot see is a removal you cannot undo.
  const excludedItems = selectedId
    ? ((templates ?? []) as TemplateRow[]).filter(
        (t) => t.destination_id === null && (exclusions ?? []).some((e) => e.template_id === t.id)
      )
    : [];

  return (
    <div className="w-full">
      <h2 className="mb-1 text-lg font-semibold text-ink">Create Doc Checklist</h2>
      <p className="mb-5 max-w-3xl text-sm text-muted">
        What each destination asks a student for. Drag a section from the palette into the checklist, add requirements
        to it, and reorder either by dragging or with the arrows. A requirement on the{" "}
        <strong className="font-medium text-ink">All destinations</strong> list is asked for by every country &mdash;
        edit it there once, or drop it from a single country without affecting the rest.
      </p>

      <DestinationPicker
        destinations={destinations ?? []}
        selected={destination ?? ""}
        sectionCounts={Object.fromEntries(
          (destinations ?? []).map((d) => [
            d.id,
            (destinationSections ?? []).filter((s) => s.destination_id === d.id).length,
          ])
        )}
        allCount={(destinationSections ?? []).filter((s) => s.destination_id === null).length}
      />

      {!hasSelection ? (
        <Card className="mt-6">
          <p className="text-sm text-muted">
            Pick a destination above to build or edit its checklist, or pick{" "}
            <strong className="font-medium text-ink">All destinations</strong> to edit the requirements every country
            shares.
          </p>
        </Card>
      ) : (
        <ChecklistBuilder
          destinationId={selectedId ?? null}
          destinationLabel={selectedDestination?.display_name ?? "All destinations"}
          isAllDestinations={destination === "all"}
          palette={(sections ?? []).map((s) => ({
            key: s.key,
            label: s.label,
            isPredefined: Boolean(s.is_predefined),
            inUse: checklist.some((c) => c.key === s.key),
          }))}
          sections={checklist.map((s) => ({
            key: s.key,
            label: s.label,
            items: s.items.map((i) => ({
              id: i.id,
              name: i.name,
              description: i.description ?? null,
              required: i.required,
              level: i.level,
              isShared: i.isShared,
            })),
          }))}
          excludedItems={excludedItems.map((t) => ({ id: t.id, name: t.name, category: t.category }))}
        />
      )}
    </div>
  );
}
