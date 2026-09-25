import { Card } from "@/components/ui/Card";
import { RegisterStudentForm } from "./RegisterStudentForm";
import { getCachedCounselors, getCachedDestinations, selectableDestinations } from "@/lib/cachedQueries";
import { getStaffSession } from "@/lib/auth/session";
import { canSetService } from "@/lib/serviceType";

export default async function NewRegisteredStudentPage() {
  const [counselors, allDestinations, { staff }] = await Promise.all([getCachedCounselors(), getCachedDestinations(), getStaffSession()]);
  // A paused destination is one we cannot currently deliver, so it must not be
  // offered on a form that takes a fee for it.
  const destinations = selectableDestinations(allDestinations);

  return (
    <div className="w-full">
      <h2 className="mb-4 text-lg font-semibold text-ink">Register student manually</h2>
      <Card>
        <RegisterStudentForm counselors={counselors} destinations={destinations} canSetService={canSetService(staff)} />
      </Card>
    </div>
  );
}
