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

  const [{ data: student, error }, { data: italyApp }, { data: profile }] = await Promise.all([
    supabase
      .from("students")
      .select("id, full_name, email, contact_number, country_of_interest, portal_active, registration_status")
      .eq("id", id)
      .maybeSingle(),
    supabase
      .from("applications")
      .select("id, university:universities(destination:destinations(country_code))")
      .eq("student_id", id),
    supabase.from("student_profiles").select("photo_path").eq("student_id", id).maybeSingle(),
  ]);

  if (error || !student) notFound();

  let photoUrl: string | null = null;
  if (profile?.photo_path) {
    const { data } = await supabase.storage.from("documents").createSignedUrl(profile.photo_path, 3600);
    photoUrl = data?.signedUrl ?? null;
  }

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
      <div className="mt-2 mb-4 flex flex-wrap items-center justify-between gap-4">
        <div className="flex min-w-0 flex-wrap items-center gap-4">
          {/* Display only — the upload controls live on the Profile tab. */}
          {photoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={photoUrl} alt={student.full_name} className="h-16 w-16 flex-shrink-0 rounded-full border border-border object-cover" />
          ) : (
            <div className="flex h-16 w-16 flex-shrink-0 items-center justify-center rounded-full border border-dashed border-border text-[10px] text-muted">
              No photo
            </div>
          )}
          <div className="min-w-0">
            <h2 className="text-xl font-semibold text-ink">{student.full_name}</h2>
            <p className="text-sm text-muted">
              {student.email ?? "No email"} · {student.contact_number ?? "No phone"} · {student.country_of_interest ?? "—"}
            </p>
          </div>
        </div>
        <div className="flex flex-col items-end gap-2">
          <div className="flex flex-wrap items-center justify-end gap-2">
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
