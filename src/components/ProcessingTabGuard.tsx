import Link from "next/link";
import { getStaffSession } from "@/lib/auth/session";
import { seesStagesOnly } from "@/lib/auth/studentAccess";
import { Card } from "@/components/ui/Card";

/**
 * Stands in front of a registered student's processing tabs — Documents,
 * Applications, Scholarship — for a counsellor with no processing role.
 *
 * The tab strip does not offer these to them (StudentTabs, stagesOnly); this
 * is what answers when the address is typed or a link is followed from
 * somewhere else. The database refuses their writes as well (0276).
 */
export async function ProcessingTabGuard({ studentId, children }: { studentId: string; children: React.ReactNode }) {
  const { staff } = await getStaffSession();
  if (!seesStagesOnly(staff)) return <>{children}</>;

  return (
    <div data-processing-only>
      <Card className="max-w-xl">
        <h2 className="text-base font-semibold text-ink">This is the processing team&apos;s work</h2>
        <p className="mt-1 text-sm text-muted">
          Once a student is registered, their documents, applications, scholarship and visa are handled by the processing
          team. You can follow their progress through the country stages on the student&apos;s dashboard.
        </p>
        <Link href={`/students/${studentId}`} className="mt-3 inline-block w-fit text-sm font-medium text-primary hover:underline">
          Back to the student&apos;s progress
        </Link>
      </Card>
    </div>
  );
}
