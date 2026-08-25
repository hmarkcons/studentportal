export type ServiceFieldType = "text" | "number" | "date" | "boolean" | "select";

export type ServiceFieldDef = {
  key: string;
  label: string;
  type: ServiceFieldType;
  options?: string[];
};

export const ADDITIONAL_SERVICE_TYPES = [
  "ibcc_attestation",
  "hec_attestation",
  "apostille",
  "mofa_attestation",
  "family_income_certificate",
  "property_certificate",
  "affidavits",
  "cimea_payment",
  "visa_appointments",
] as const;

export const ADDITIONAL_SERVICE_LABELS: Record<string, string> = {
  ibcc_attestation: "IBCC Attestation",
  hec_attestation: "HEC Attestation",
  apostille: "Apostille",
  mofa_attestation: "MOFA Attestation",
  family_income_certificate: "Family Income Certificate",
  property_certificate: "Property Certificate",
  affidavits: "Affidavits",
  cimea_payment: "CIMEA Payment",
  visa_appointments: "Visa Appointments",
};

// Per-type "extra columns" from Module 1O of the scope doc — stored in
// additional_service_requests.extra_fields (jsonb). The standard columns
// (passport, docs submitted, fee, etc.) are real table columns and are
// rendered separately in the form.
export const ADDITIONAL_SERVICE_FIELDS: Record<string, ServiceFieldDef[]> = {
  ibcc_attestation: [
    {
      key: "document_type",
      label: "Document type",
      type: "select",
      options: ["secondary_certificate", "o_level_certificate", "a_level_certificate", "transcript"],
    },
    { key: "document_count", label: "Number of documents", type: "number" },
    { key: "ibcc_reference_number", label: "IBCC reference/tracking number", type: "text" },
    { key: "turnaround_time", label: "Turnaround/processing time", type: "text" },
    { key: "status", label: "Status", type: "select", options: ["pending", "in_process", "completed"] },
  ],
  hec_attestation: [
    { key: "document_type", label: "Document type", type: "select", options: ["degree", "transcript"] },
    { key: "document_count", label: "Number of documents", type: "number" },
    { key: "hec_reference_number", label: "HEC reference number", type: "text" },
    { key: "turnaround_time", label: "Turnaround/processing time", type: "text" },
    {
      key: "university_verification_status",
      label: "University verification status",
      type: "select",
      options: ["verified", "pending_verification", "not_verified"],
    },
  ],
  apostille: [
    { key: "document_type_count", label: "Document type & count", type: "text" },
    { key: "batch_type", label: "Batch type", type: "select", options: ["personal", "legal", "mixed"] },
    { key: "apostille_certificate_number", label: "Apostille certificate/sticker number", type: "text" },
    { key: "turnaround_time", label: "Turnaround/processing time", type: "text" },
    { key: "appointment_date", label: "Appointment date", type: "date" },
  ],
  mofa_attestation: [
    { key: "document_type", label: "Document type", type: "text" },
    { key: "document_name", label: "Document name", type: "text" },
    { key: "document_count", label: "Number of documents", type: "number" },
    { key: "mofa_reference_number", label: "MOFA reference number", type: "text" },
    { key: "turnaround_time", label: "Turnaround/processing time", type: "text" },
  ],
  family_income_certificate: [
    { key: "certificate_reference_number", label: "Certificate reference number", type: "text" },
    { key: "purpose", label: "Purpose (e.g. scholarship application)", type: "text" },
    { key: "turnaround_time", label: "Turnaround/processing time", type: "text" },
    { key: "fbr_rto", label: "FBR RTO (Regional Tax Office)", type: "select", options: ["I", "II", "III", "IV", "V"] },
    { key: "zone", label: "Zone", type: "select", options: ["I", "II", "III", "IV", "V"] },
    { key: "commissioner_name", label: "Commissioner name", type: "text" },
    { key: "email_sent_to_mofa_date", label: "Email sent to MOFA (date)", type: "date" },
    { key: "document_issue_date", label: "Document issue date", type: "date" },
  ],
  property_certificate: [
    { key: "issuing_authority", label: "Issuing authority", type: "text" },
    { key: "certificate_reference_number", label: "Certificate/property reference number", type: "text" },
    { key: "turnaround_time", label: "Turnaround/processing time", type: "text" },
  ],
  affidavits: [
    { key: "affidavit_type", label: "Affidavit type/purpose", type: "text" },
    { key: "turnaround_time", label: "Turnaround/processing time", type: "text" },
    { key: "notarized", label: "Notarized", type: "boolean" },
    { key: "text_finalized", label: "Affidavit text finalized by the student", type: "boolean" },
  ],
  cimea_payment: [
    { key: "statement_type", label: "Statement type", type: "select", options: ["comparability", "verification", "dov"] },
    { key: "cimea_reference_number", label: "CIMEA reference number", type: "text" },
    { key: "status", label: "Status", type: "select", options: ["requested", "processing", "issued"] },
    { key: "turnaround_time", label: "Turnaround/processing time", type: "text" },
    { key: "payment_made", label: "Payment made", type: "boolean" },
  ],
  visa_appointments: [
    { key: "appointment_center", label: "Appointment center", type: "select", options: ["vfs", "consulate", "embassy", "bls"] },
    { key: "destination_country", label: "Destination country", type: "text" },
    { key: "appointment_request_range", label: "Appointment request date range (e.g. within next 2-4 weeks)", type: "text" },
    { key: "appointment_datetime", label: "Appointment date & time booked", type: "text" },
    { key: "confirmation_number", label: "Confirmation number", type: "text" },
  ],
};
