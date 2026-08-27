import { Card } from "@/components/ui/Card";
import { NewLeadForm } from "./NewLeadForm";
import { getCachedCounselors, getCachedDestinations } from "@/lib/cachedQueries";

export default async function NewLeadPage() {
  const [counselors, destinations] = await Promise.all([getCachedCounselors(), getCachedDestinations()]);

  return (
    <div className="w-full">
      <h2 className="mb-4 text-lg font-semibold text-ink">New lead</h2>
      <Card>
        <NewLeadForm counselors={counselors} destinations={destinations} />
      </Card>
    </div>
  );
}
