import { Card } from "@/components/ui/Card";
import { RegisterStudentForm } from "./RegisterStudentForm";
import { getCachedCounselors, getCachedDestinations } from "@/lib/cachedQueries";

export default async function NewRegisteredStudentPage() {
  const [counselors, destinations] = await Promise.all([getCachedCounselors(), getCachedDestinations()]);

  return (
    <div className="w-full">
      <h2 className="mb-4 text-lg font-semibold text-ink">Register student manually</h2>
      <Card>
        <RegisterStudentForm counselors={counselors} destinations={destinations} />
      </Card>
    </div>
  );
}
