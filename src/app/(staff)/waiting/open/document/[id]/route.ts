import { NextResponse, type NextRequest } from "next/server";
import { getStaffSession } from "@/lib/auth/session";
import { hasRole } from "@/lib/auth/roles";
import { documentTargetHref } from "@/lib/waitingItems";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Opens a document waiting for review, from Waiting on you, and marks it seen.
 *
 * A submitted document becomes under_review — the student sees "Under
 * review" — and records who opened it and when (0305), so the list can tell
 * the next officer somebody is on it. It stays listed until it is accepted or
 * sent back; a new upload from the student clears the mark (a trigger).
 *
 * Then on to the document itself: the student's Documents tab with its
 * section open and the row picked out (DocumentChecklist's focusDocId).
 *
 * Only for the people whose job reviewing is — and row-level security
 * (staff_can_process_student) says the same again — so anyone else following
 * the link simply lands on the page without marking anything.
 */
export async function GET(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const back = (path: string) => NextResponse.redirect(new URL(path, request.url), 303);
  if (!UUID.test(id)) return back("/waiting");

  const { supabase, staff } = await getStaffSession();
  if (!staff) return back("/login");

  const { data: doc } = await supabase
    .from("student_documents")
    .select("id, student_id, status, cycle_id")
    .eq("id", id)
    .maybeSingle();
  // Gone, or not this person's to see: back to the list, which no longer has it.
  if (!doc) return back("/waiting");

  if ((doc.status === "submitted" || doc.status === "under_review") && hasRole(staff, "processing", "management", "super_admin")) {
    // Conditional on the status, so a decision made in the meantime — accepted
    // a moment ago in another tab — is never turned back into "under review".
    await supabase
      .from("student_documents")
      .update({ status: "under_review", review_opened_by: staff.id, review_opened_at: new Date().toISOString() })
      .eq("id", id)
      .in("status", ["submitted", "under_review"]);
  }

  return back(documentTargetHref(doc.student_id as string, id, (doc.cycle_id as string | null) ?? null));
}
