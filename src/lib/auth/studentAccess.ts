// Who does what to a registered student.
//
// Counsellors sell: from the first enquiry to registration. After that the
// student belongs to processing — admissions, documents, visa, scholarship —
// and a counsellor follows their progress without changing it. So a staff
// member whose only student-facing role is Counselor sees a registered
// student's country stages, contact details and messages, and nothing of the
// processing work (Documents, Applications, Scholarship and Visa tabs).
//
// The database holds the same line (0276, staff_can_process_student): the
// assigned counsellor may write a student's applications, documents and stage
// progress only while the student is not yet registered.
//
// Finance keeps the access it had — it was not part of this change.

import { hasRole } from "./roles.ts";

type RoleBearing = Parameters<typeof hasRole>[0];

/** May work on a registered student's processing: admissions, documents, visa, scholarship, stages. */
export function canWorkProcessing(staff: RoleBearing): boolean {
  return hasRole(staff, "processing", "management", "super_admin", "finance");
}

/** A counsellor with no processing role: sees a registered student's stages, contact details and messages only. */
export function seesStagesOnly(staff: RoleBearing): boolean {
  return hasRole(staff, "counselor") && !canWorkProcessing(staff);
}
