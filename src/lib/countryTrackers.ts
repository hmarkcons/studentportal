export type TrackerFieldType = "text" | "boolean" | "date" | "select" | "credential" | "multi_test" | "multi_select";

export type TrackerFieldDef = {
  key: string;
  label: string;
  type: TrackerFieldType;
  options?: string[];
  credentialType?: string; // for type: 'credential'
  // Dynamic multi_select option source, resolved server-side and passed as
  // `options` at render time (see tracker page) — 'pending_documents' pulls
  // from that application's document checklist instead of a static list.
  dynamicOptions?: "pending_documents";
  // Only rendered once the referenced sibling field currently holds `equals`.
  showWhen?: { key: string; equals: string };
};

// Keyed by destinations.country_code. Values are the extra tracker fields
// from the doc's per-country Documentation Tracker modules (N-T) that
// aren't already covered by the generic applications/documents/visa tables.
export const COUNTRY_TRACKER_FIELDS: Record<string, TrackerFieldDef[]> = {
  IT: [
    { key: "skype_id", label: "Skype ID (optional)", type: "text" },
    { key: "test_status", label: "Admission test(s)", type: "multi_test", options: ["IMAT", "TOLC", "CEnT-S", "SAT"] },
    { key: "eligible_fields", label: "Eligible fields of study (Required Departments)", type: "text" },
    { key: "remarks", label: "Remarks (anything the dropdown doesn't cover)", type: "text" },
    { key: "fiscal_code", label: "Fiscal Code", type: "text" },
    { key: "translation_status", label: "Translation status", type: "select", options: ["In progress", "Completed", "Pending"] },
    { key: "visa_docs_status", label: "Visa docs status", type: "select", options: ["Pending", "Completed"] },
    { key: "pending_documents", label: "Pending documents", type: "multi_select", dynamicOptions: "pending_documents" },
    { key: "visa_appointment_status", label: "Visa appointment status", type: "select", options: ["Booked", "Pending"] },
    {
      key: "visa_appointment_date",
      label: "Visa appointment date",
      type: "date",
      showWhen: { key: "visa_appointment_status", equals: "Booked" },
    },
    { key: "visa_application_submitted", label: "Visa application submitted", type: "boolean" },
    { key: "enrollment_fee_paid", label: "Enrollment fee paid", type: "boolean" },
    { key: "preenrollment_university", label: "Pre-enrollment university", type: "select" }, // options injected per-student at render time
    { key: "preenrollment_status", label: "Pre-enrollment status", type: "select", options: ["Submitted", "Rejected", "Summary Issued"] },
    {
      key: "scholarship_docs_status",
      label: "Scholarship Documents status",
      type: "select",
      options: ["Completed", "Pending", "In process", "Apostille in progress", "Translation in progress"],
    },
    { key: "scholarship_region", label: "Scholarship Region (auto-filled from pre-enrollment university)", type: "text" },
    { key: "stipend_ranking_date", label: "Stipend ranking date", type: "date" },
    { key: "preenrollment_portal", label: "Pre-Enrollment (Universitaly) portal", type: "credential", credentialType: "universitaly_preenrollment" },
    { key: "cimea_portal", label: "CIMEA portal", type: "credential", credentialType: "cimea" },
    { key: "university_portal", label: "University portal", type: "credential", credentialType: "university_portal" },
    { key: "scholarship_portal", label: "Scholarship portal", type: "credential", credentialType: "scholarship_portal" },
    { key: "gmail_portal", label: "Gmail", type: "credential", credentialType: "gmail" },
  ],
  DE: [
    { key: "admission_pathway", label: "Admission pathway", type: "select", options: ["uni_assist", "direct"] },
    { key: "vpd_status", label: "VPD status", type: "text" },
    { key: "hec_attested_degree_uploaded", label: "HEC-attested degree uploaded", type: "boolean" },
    { key: "language_certificate", label: "Language certificate type & score", type: "text" },
    { key: "blocked_account_status", label: "Blocked account status", type: "text" },
    { key: "uni_assist_status", label: "Uni-assist / application status", type: "text" },
    { key: "admission_letter_status", label: "Admission letter (Zulassungsbescheid) status", type: "text" },
  ],
  AT: [
    { key: "studienplatznachweis_status", label: "Studienplatznachweis status", type: "text" },
    { key: "attestation_status", label: "IBCC / HEC / MOFA attestation status", type: "text" },
    { key: "erganzungsprufung_required", label: "Ergänzungsprüfung required", type: "boolean" },
    { key: "language_certificate", label: "Language certificate", type: "text" },
    { key: "application_status", label: "Application status", type: "text" },
    { key: "admission_letter_status", label: "Admission letter status", type: "text" },
  ],
  FR: [
    { key: "eef_track", label: "EeF application track", type: "select", options: ["candidature", "pre_consular"] },
    { key: "academic_interview_date", label: "Academic interview date", type: "date" },
    { key: "academic_interview_outcome", label: "Academic interview outcome", type: "text" },
    { key: "attestation_status", label: "IBCC / HEC attestation status", type: "text" },
    { key: "language_certificate", label: "Language certificate", type: "text" },
    { key: "university_response_status", label: "University response status", type: "text" },
    { key: "visa_status", label: "Visa status", type: "text" },
  ],
  HU: [
    { key: "program", label: "Program", type: "text" },
    { key: "application_status", label: "Application status", type: "text" },
    { key: "language_certificate", label: "Language certificate", type: "text" },
    { key: "document_attestation_status", label: "Document attestation status", type: "text" },
    { key: "admission_decision", label: "Admission decision", type: "text" },
    { key: "visa_status", label: "Visa status", type: "text" },
  ],
  LU: [
    { key: "program", label: "Program", type: "text" },
    { key: "diploma_equivalence_status", label: "Diploma equivalence recognition status", type: "text" },
    { key: "language_certificate", label: "Language certificate", type: "text" },
    { key: "application_status", label: "Application status", type: "text" },
    { key: "admission_decision", label: "Admission decision", type: "text" },
    { key: "visa_status", label: "Visa status", type: "text" },
  ],
};
