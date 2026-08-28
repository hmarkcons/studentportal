import Link from "next/link";
import { notFound } from "next/navigation";
import { getStaffSession } from "@/lib/auth/session";
import { Badge } from "@/components/ui/Badge";
import { StudentTabs } from "./StudentTabs";
import { DeleteStudentButton } from "./DeleteStudentButton";
import { InlineRegistrationStatusCell } from "../InlineRegistrationStatusCell";

export default async function StudentLayout({ children, params }: { children: React.ReactNode; params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, staff: staffRow } = await getStaffSession();
  const canDeleteStudent = staffRow?.role === "super_admin" || staffRow?.role === "processing";

  const [{ data: student, error }, { data: italyApp }] = await Promise.all([
    supabase
      .from("students")
      .select("id, full_name, email, contact_number, country_of_interest, portal_active, registration_status")
      .eq("id", id)
      .maybeSingle(),
    supabase
      .from("applications")
      .select("id, university:universities(destination:destinations(country_code))")
      .eq("student_id", id),
  ]);

  if (error || !student) notFound();

  const showScholarship = (italyApp ?? []).some((a) => {
    const uni = Array.isArray(a.university) ? a.university[0] : a.university;
    const dest = uni ? (Array.isArray(uni.destination) ? uni.destination[0] : uni.destination) : null;
    return dest?.country_code === "IT";
  });

  return (
    <div className="w-full">
      <Link href="/students" className="text-sm text-muted hover:text-ink">
        &larr; Back to students
      </Link>
      <div className="mt-2 mb-4 flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-ink">{student.full_name}</h2>
          <p className="text-sm text-muted">
            {student.email ?? "No email"} · {student.contact_number ?? "No phone"} · {student.country_of_interest ?? "—"}
          </p>
        </div>
        <div className="flex flex-col items-end gap-2">
          <div className="flex items-center gap-2">
            <Badge tone={student.portal_active ? "success" : "neutral"}>{student.portal_active ? "Portal active" : "Portal inactive"}</Badge>
            <InlineRegistrationStatusCell studentId={id} status={student.registration_status} />
          </div>
          {canDeleteStudent && <DeleteStudentButton studentId={id} studentName={student.full_name} />}
        </div>
      </div>

      <StudentTabs studentId={id} showScholarship={showScholarship} />

      {children}
    </div>
  );
}
