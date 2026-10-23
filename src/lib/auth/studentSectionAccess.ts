import { getEffectivePermissions } from "./permissions";

/**
 * Whether the signed-in staff member may add / edit / delete in each section of
 * a registered student (0343), for showing or hiding the controls. The same
 * keys the write actions enforce (requireStaffStudentWrite), so a button is
 * shown exactly when the action behind it would be allowed — no button that
 * only fails on click, and no hidden action someone could reach anyway.
 *
 * RLS is still the real boundary underneath: a toggle being on never lets a
 * write past a policy that refuses it, it only decides whether the control is
 * offered.
 */
export type StudentSectionAccess = {
  profile: { add: boolean; edit: boolean; delete: boolean };
  applications: { add: boolean; edit: boolean; delete: boolean };
  documents: { add: boolean; edit: boolean; delete: boolean };
  scholarship: { add: boolean; edit: boolean; delete: boolean };
  visa: { edit: boolean };
  communication: { send: boolean };
};

export async function studentSectionAccess(): Promise<StudentSectionAccess> {
  const p = await getEffectivePermissions();
  const can = (key: string) => p[key] === true;
  return {
    profile: { add: can("student.profile.add"), edit: can("student.profile.edit"), delete: can("student.profile.delete") },
    applications: { add: can("student.applications.add"), edit: can("student.applications.edit"), delete: can("student.applications.delete") },
    documents: { add: can("student.documents.add"), edit: can("student.documents.edit"), delete: can("student.documents.delete") },
    scholarship: { add: can("student.scholarship.add"), edit: can("student.scholarship.edit"), delete: can("student.scholarship.delete") },
    visa: { edit: can("student.visa.edit") },
    communication: { send: can("student.communication.send") },
  };
}
