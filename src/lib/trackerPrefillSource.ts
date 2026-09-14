import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { PrefillSource } from "@/lib/trackerPrefill";

/**
 * Gathers what the rest of the record already knows about this student, for
 * the tracker to offer rather than ask again.
 *
 * Two queries, both narrow. The documents come in from the caller because the
 * student page has already fetched them — asking for them twice in one render
 * is how the same page ends up disagreeing with itself.
 */
export async function loadTrackerPrefillSource(
  studentId: string,
  documents: { category: string | null; status: string | null; file_path: string | null }[]
): Promise<PrefillSource> {
  const supabase = await createClient();

  const [{ data: lead }, { data: profile }, { data: scores }] = await Promise.all([
    supabase.from("leads").select("course_of_interest, finalized_course_of_interest").eq("id", studentId).maybeSingle(),
    supabase.from("student_profiles").select("visa_refusal_history").eq("student_id", studentId).maybeSingle(),
    supabase.from("student_test_scores").select("test_type, score, custom_test_name").eq("student_id", studentId),
  ]);

  // Every scholarship requirement raised for this student, and how far each
  // has got. A requirement is a row from the moment it is raised, so the
  // count of rows is the count of things owed.
  const scholarship = documents.filter((d) => d.category === "scholarship_documents");

  return {
    courseOfInterest: lead?.course_of_interest ?? null,
    finalizedCourseOfInterest: lead?.finalized_course_of_interest ?? null,
    visaRefusalHistory: profile?.visa_refusal_history ?? null,
    testScores: (scores ?? []).map((s) => ({
      testType: s.test_type,
      score: s.score,
      customTestName: s.custom_test_name,
    })),
    scholarshipDocs: {
      required: scholarship.length,
      uploaded: scholarship.filter((d) => d.file_path).length,
      verified: scholarship.filter((d) => d.status === "verified").length,
    },
  };
}
