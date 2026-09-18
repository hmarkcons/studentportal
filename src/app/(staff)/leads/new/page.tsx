import { Card } from "@/components/ui/Card";
import { NewLeadForm } from "./NewLeadForm";
import { getCachedCounselors, getCachedDestinations, selectableDestinations } from "@/lib/cachedQueries";

export default async function NewLeadPage() {
  const [counselors, allDestinations] = await Promise.all([getCachedCounselors(), getCachedDestinations()]);
  // A paused destination is one we cannot currently deliver, so it must not be
  // offered on a form that takes a fee for it.
  const destinations = selectableDestinations(allDestinations);

  return (
    <div className="w-full">
      <h2 className="mb-4 text-lg font-semibold text-ink">New lead</h2>
      <Card>
        <NewLeadForm counselors={counselors} destinations={destinations} />
      </Card>
    </div>
  );
}
