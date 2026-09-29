import { createClient } from "@/lib/supabase/server";
import { Globe, Info, Luggage, PartyPopper, Plane } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { PortalPageHeader } from "@/components/studentPortal/PortalPageHeader";
import { PortalEmpty } from "@/components/studentPortal/PortalEmpty";
import { approvedVisaDestinations } from "@/lib/studentVisaApproval";
import { TravelChecklist, type TravelSection } from "./TravelChecklist";

/**
 * Travel & Arrival — what to take, and what to do once you land.
 *
 * Only for a student whose visa has actually been issued. A refused student
 * must never open a page about packing for a country they are not going to, so
 * the gate is the visa outcome recorded in the documentation tracker — the same
 * source the Visa tab and the menu entry read, rather than a second flag
 * somebody has to remember to set.
 */
export default async function PortalTravelPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: student } = await supabase
    .from("students")
    .select("id")
    .eq("auth_user_id", user?.id ?? "")
    .maybeSingle();
  if (!student) return null;

  const approved = await approvedVisaDestinations(supabase, student.id);

  if (approved.length === 0) {
    // Deliberately says nothing about a refusal. A student who has just been
    // refused does not need a second page telling them so — and this page is
    // not in their menu, so they only reach it by typing the address.
    return (
      <div className="flex w-full flex-col gap-6" data-portal-page>
        <PortalPageHeader icon={Plane} title="Travel & Arrival" description="What to carry, and what to do in your first days after you land." />
        <Card>
          <PortalEmpty icon={Luggage}>
            This is where your travel checklist will appear — what to carry, and what to do in your first days after you
            land. It opens once your visa has been issued.
          </PortalEmpty>
        </Card>
      </div>
    );
  }

  const [{ data: sections }, { data: checks }] = await Promise.all([
    supabase
      .from("travel_guide_sections")
      .select("id, destination_id, title, intro, sort_order, items:travel_guide_items(id, label, detail, days_after_arrival, sort_order)")
      .in("destination_id", approved.map((a) => a.destinationId))
      .order("sort_order"),
    supabase.from("student_travel_checks").select("item_id").eq("student_id", student.id),
  ]);

  const doneIds = new Set((checks ?? []).map((c) => c.item_id as string));

  const byDestination = new Map<string, TravelSection[]>();
  for (const s of sections ?? []) {
    const items = ((s.items ?? []) as {
      id: string;
      label: string;
      detail: string | null;
      days_after_arrival: number | null;
      sort_order: number;
    }[])
      .slice()
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((i) => ({
        id: i.id,
        label: i.label,
        detail: i.detail,
        daysAfterArrival: i.days_after_arrival,
        done: doneIds.has(i.id),
      }));
    if (items.length === 0) continue;
    const list = byDestination.get(s.destination_id) ?? [];
    list.push({ id: s.id, title: s.title, intro: s.intro, items });
    byDestination.set(s.destination_id, list);
  }

  const withGuides = approved.filter((a) => (byDestination.get(a.destinationId)?.length ?? 0) > 0);

  return (
    <div className="flex w-full flex-col gap-6" data-portal-page>
      <PortalPageHeader
        icon={Plane}
        eyebrow={
          <span className="inline-flex items-center gap-1.5">
            <PartyPopper aria-hidden className="h-3.5 w-3.5 shrink-0" />
            Your visa is issued — congratulations
          </span>
        }
        title="Travel & Arrival"
        description="This is what to carry with you and what to do once you land. Tick things off as you go; it saves as you tick, and your counsellor can see where you are up to."
      />

      {withGuides.length === 0 ? (
        <Card>
          <PortalEmpty icon={Luggage} title="Your checklist is on its way">
            Your counsellor is putting your arrival checklist together. It will appear here shortly — ask them directly
            if you are travelling soon.
          </PortalEmpty>
        </Card>
      ) : (
        <div className="flex flex-col gap-8">
          {withGuides.map((a) => (
            <div key={a.destinationId}>
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <Globe aria-hidden className="h-5 w-5 text-primary shrink-0" />
                <h3 className="text-base font-semibold text-ink">{a.country}</h3>
                {a.university && <span className="text-xs text-muted">{a.university}</span>}
                <Badge tone="success">Visa issued</Badge>
              </div>
              <TravelChecklist sections={byDestination.get(a.destinationId) ?? []} />
            </div>
          ))}
        </div>
      )}

      <p className="flex items-start gap-2 rounded-xl border border-border bg-card px-4 py-3 text-xs text-muted">
        <Info aria-hidden className="mt-px h-4 w-4 text-info shrink-0" />
        Rules change. If anything here does not match what an official tells you, believe the official — and tell your
        counsellor so we can correct it for the students coming after you.
      </p>
    </div>
  );
}
