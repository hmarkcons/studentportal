import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Badge } from "@/components/ui/Badge";
import { StudentTabs } from "./StudentTabs";

export default async function StudentLayout({ children, params }: { children: React.ReactNode; params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: student, error } = await supabase
    .from("students")
    .select("id, full_name, email, contact_number, country_of_interest, portal_active")
    .eq("id", id)
    .maybeSingle();

  if (error || !student) notFound();

  const { data: italyApp } = await supabase
    .from("applications")
    .select("id, university:universities(destination:destinations(country_code))")
    .eq("student_id", id);

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
        <Badge tone={student.portal_active ? "success" : "neutral"}>{student.portal_active ? "Portal active" : "Portal inactive"}</Badge>
      </div>

      <StudentTabs studentId={id} showScholarship={showScholarship} />

      {children}
    </div>
  );
}
