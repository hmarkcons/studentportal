import { hasRole } from "@/lib/auth/roles";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getStaffSession } from "@/lib/auth/session";
import { Badge } from "@/components/ui/Badge";
import { StudentTabs } from "./StudentTabs";
import { DeleteStudentButton } from "./DeleteStudentButton";
import { InlineRegistrationStatusCell } from "../InlineRegistrationStatusCell";
import { countUnreadMessages } from "@/lib/unreadMessages";
import { avatarUrlMap } from "@/lib/storageUrls";
import { canSeeVisaSection } from "@/lib/visaAccess";

export default async function StudentLayout({ children, params }: { children: React.ReactNode; params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, staff: staffRow } = await getStaffSession();
  const canDeleteStudent = hasRole(staffRow, "super_admin") || hasRole(staffRow, "processing");

  // One wave for everything that depends on nothing. The unread count, the
  // scholarship-body list and the student's own row used to run one after
  // another below, each waiting on the last for no reason.
  const [
    { data: student, error },
    { data: italyApp },
    { data: profile },
    { data: finalizedApp },
    unreadMessages,
    { data: scholarshipBodyLinks },
  ] = await Promise.all([
    supabase
      .from("students")
      .select(
        "id, full_name, email, contact_number, country_of_interest, portal_active, registration_status, student_code, intake, student_seq, legacy_student_codes"
      )
      .eq("id", id)
      .maybeSingle(),
    supabase
      .from("applications")
      .select("id, university:universities(destination:destinations(id, country_code))")
      .eq("student_id", id),
    supabase.from("student_profiles").select("photo_path").eq("student_id", id).maybeSingle(),
    supabase
      .from("applications")
      .select("id, university:universities(name, destination:destinations(country_code, finalized_badge_label))")
      .eq("student_id", id)
      .eq("is_finalized", true)
      .maybeSingle(),
    // Messages this student has sent that no one on the team has opened yet.
    countUnreadMessages(supabase, id, "staff"),
    supabase.from("scholarship_body_destinations").select("destination_id"),
  ]);

  if (error || !student) notFound();

  const finalizedUni = finalizedApp
    ? ((Array.isArray(finalizedApp.university) ? finalizedApp.university[0] : finalizedApp.university) as
        | { name?: string; destination?: unknown }
        | null)
    : null;
  const finalizedUniversityName = finalizedUni?.name ?? null;
  const finalizedDest = finalizedUni?.destination
    ? ((Array.isArray(finalizedUni.destination) ? finalizedUni.destination[0] : finalizedUni.destination) as
        | { country_code?: string; finalized_badge_label?: string }
        | null)
    : null;
  // What this destination calls the state, set in Setup rather than compared
  // against a country code here.
  const finalizedBadgeLabel = finalizedDest?.finalized_badge_label ?? "Finalized for visa";

  // The tab appears for any country that has a scholarship body on file, not
  // only Italy. It was hardcoded to "IT" while the page itself had already
  // grown to handle every country — so a France student with an Eiffel
  // scholarship recorded against them had no tab to see it in.
  //
  // Whether the tab has anything IN it is a separate question, answered by
  // scholarshipGate: nothing until a university is finalised for pre-enrolment.
  const destinationsWithBodies = new Set((scholarshipBodyLinks ?? []).map((l) => l.destination_id as string));

  // The second and last wave: both of these need something from the first.
  // A country somebody has answered "No" for on the tracker does not count
  // towards showing the tab. If that is every country the student has, the
  // tab goes away entirely rather than opening onto an explanation — the
  // decision was taken and there is nothing there to manage.
  const [photoMap, { data: declinedRows }] = await Promise.all([
    avatarUrlMap([profile?.photo_path]),
    supabase
      .from("application_country_extra")
      .select("application_id")
      .eq("field_key", "scholarship_intent")
      .eq("field_value", "No")
      .in("application_id", (italyApp ?? []).map((a) => a.id)),
  ]);
  const photoUrl = profile?.photo_path ? photoMap.get(profile.photo_path) ?? null : null;
  const declined = new Set((declinedRows ?? []).map((r) => r.application_id));

  const showScholarship = (italyApp ?? []).some((a) => {
    if (declined.has(a.id)) return false;
    const uni = Array.isArray(a.university) ? a.university[0] : a.university;
    const dest = uni ? (Array.isArray(uni.destination) ? uni.destination[0] : uni.destination) : null;
    return Boolean(dest?.id && destinationsWithBodies.has(dest.id));
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
            // Sized and decoded off the critical path: these are uploaded
            // phone photos shown at 64 pixels, and without the attributes the
            // browser preloads them at full resolution and holds the page's
            // load event open until they arrive.
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={photoUrl}
              alt={student.full_name}
              width={64}
              height={64}
              loading="lazy"
              decoding="async"
              className="h-16 w-16 flex-shrink-0 rounded-full border border-border object-cover"
            />
          ) : (
            <div className="flex h-16 w-16 flex-shrink-0 items-center justify-center rounded-full border border-dashed border-border text-[10px] text-muted">
              No photo
            </div>
          )}
          <div className="min-w-0">
            <h2 className="text-xl font-semibold text-ink">{student.full_name}</h2>
            {/* Their own number, issued once their intake and country are both
                known. On the agreement and the receipt, so it is what the
                office quotes on the phone. */}
            {student.student_code ? (
              <p className="font-mono text-xs tracking-wide text-muted">
                {student.student_code}
                {/* Codes this student used to carry — the pre-0260 one, and any
                    superseded by an intake correction. Shown because they are
                    on paperwork already in the student's hands, and somebody
                    ringing up to quote one has to be recognised. */}
                {(student.legacy_student_codes ?? []).length > 0 && (
                  <span className="ml-2 font-sans text-muted/70">
                    previously {(student.legacy_student_codes as string[]).join(", ")}
                  </span>
                )}
              </p>
            ) : (
              <p className="text-xs text-warning">
                {student.intake
                  ? "No Student ID — no country on file, so none could be composed. Add their country."
                  : "No Student ID — no intake recorded. Their portal stays closed until it is."}
                {typeof student.student_seq === "number" && (
                  <span className="text-muted"> Place {student.student_seq} in the running order is held for them.</span>
                )}
              </p>
            )}
            <p className="text-sm text-muted">
              {student.email ?? "No email"} · {student.contact_number ?? "No phone"} · {student.country_of_interest ?? "—"}
            </p>
            {finalizedUniversityName && (
              <p className="mt-1 flex flex-wrap items-center gap-1.5 text-sm">
                <Badge tone="success">{finalizedBadgeLabel}</Badge>
                <span className="font-medium text-ink">{finalizedUniversityName}</span>
              </p>
            )}
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

      <StudentTabs studentId={id} showScholarship={showScholarship} showVisa={canSeeVisaSection(staffRow?.role)} unreadMessages={unreadMessages} />

      {children}
    </div>
  );
}
