-- Admin-configurable documentation tracker fields, replacing the hardcoded
-- COUNTRY_TRACKER_FIELDS map in src/lib/countryTrackers.ts. Values themselves
-- keep living in application_country_extra (field_key/field_value) — this
-- table only defines which fields exist, per country, and how to render them.

create table tracker_definitions (
  id uuid primary key default gen_random_uuid(),
  country_code text not null,
  field_key text not null,
  label text not null,
  field_type text not null check (field_type in (
    'text', 'textarea', 'number', 'date', 'select', 'multi_select', 'multi_text',
    'boolean', 'credential', 'multi_university_status'
  )),
  options jsonb,               -- string[] for select/multi_select/multi_university_status (status choices)
  credential_type text,        -- for field_type = 'credential'
  show_if_key text,            -- only render once the sibling field `show_if_key` currently equals `show_if_equals`
  show_if_equals text,         -- '*' means "any non-empty value"
  date_when_status text,       -- for multi_university_status: which status value reveals a per-row date input
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (country_code, field_key)
);

drop trigger if exists trg_tracker_definitions_updated_at on tracker_definitions;
create trigger trg_tracker_definitions_updated_at
  before update on tracker_definitions
  for each row execute function set_updated_at();

alter table tracker_definitions enable row level security;

create policy "tracker_definitions_select" on tracker_definitions for select
  using (is_active_staff());
create policy "tracker_definitions_write" on tracker_definitions for all
  using (has_role(array['super_admin']::staff_role[]))
  with check (has_role(array['super_admin']::staff_role[]));

-- ---------------------------------------------------------------------------
-- Seed: migrate the existing hardcoded fields as-is, apply the Italy
-- revisions (drop Skype ID, test_status -> single select, add IELTS score,
-- add CIMEA status/category, pending_documents -> free-text multi_text),
-- and add the new UK / US trackers.
-- ---------------------------------------------------------------------------

insert into tracker_definitions (country_code, field_key, label, field_type, options, credential_type, show_if_key, show_if_equals, date_when_status, sort_order) values
-- Italy
('IT', 'test_status', 'Admission test', 'select', '["IMAT","TOLC","CEnT-S","SAT","Other"]', null, null, null, null, 10),
('IT', 'ielts_score', 'IELTS score', 'select', '["5.0","5.5","6.0","6.5","7.0","7.5","8.0","8.5","9.0"]', null, null, null, null, 20),
('IT', 'eligible_fields', 'Eligible fields of study (Required Departments)', 'text', null, null, null, null, null, 30),
('IT', 'remarks', 'Remarks (anything the dropdown doesn''t cover)', 'text', null, null, null, null, null, 40),
('IT', 'fiscal_code', 'Fiscal Code', 'text', null, null, null, null, null, 50),
('IT', 'translation_status', 'Translation status', 'select', '["In progress","Completed","Pending"]', null, null, null, null, 60),
('IT', 'visa_docs_status', 'Visa docs status', 'select', '["Pending","Completed"]', null, null, null, null, 70),
('IT', 'pending_documents', 'Pending documents', 'multi_text', null, null, null, null, null, 80),
('IT', 'visa_appointment_status', 'Visa appointment status', 'select', '["Booked","Pending"]', null, null, null, null, 90),
('IT', 'visa_appointment_date', 'Visa appointment date', 'date', null, null, 'visa_appointment_status', 'Booked', null, 100),
('IT', 'visa_application_submitted', 'Visa application submitted', 'boolean', null, null, null, null, null, 110),
('IT', 'enrollment_fee_paid', 'Enrollment fee paid', 'boolean', null, null, null, null, null, 120),
('IT', 'preenrollment_university', 'Pre-enrollment university', 'select', '[]', null, null, null, null, 130),
('IT', 'preenrollment_status', 'Pre-enrollment status', 'select', '["Submitted","Rejected","Summary Issued"]', null, null, null, null, 140),
('IT', 'cimea_status', 'CIMEA status', 'select', '["Pending","Submitted","In process","Issued"]', null, null, null, null, 150),
('IT', 'cimea_apply_category', 'CIMEA apply category', 'select', '["Standard","Urgent"]', null, null, null, null, 160),
('IT', 'scholarship_docs_status', 'Scholarship documents status', 'select', '["Completed","Pending","In process","Apostille in progress","Translation in progress"]', null, null, null, null, 170),
('IT', 'scholarship_region', 'Scholarship region (auto-filled from pre-enrollment university)', 'text', null, null, null, null, null, 180),
('IT', 'stipend_ranking_date', 'Stipend ranking date', 'date', null, null, null, null, null, 190),
('IT', 'preenrollment_portal', 'Pre-Enrollment (Universitaly) portal', 'credential', null, 'universitaly_preenrollment', null, null, null, 200),
('IT', 'cimea_portal', 'CIMEA portal', 'credential', null, 'cimea', null, null, null, 210),
('IT', 'university_portal', 'University portal', 'credential', null, 'university_portal', null, null, null, 220),
('IT', 'scholarship_portal', 'Scholarship portal', 'credential', null, 'scholarship_portal', null, null, null, 230),
('IT', 'gmail_portal', 'Gmail', 'credential', null, 'gmail', null, null, null, 240),

-- Germany (unchanged)
('DE', 'admission_pathway', 'Admission pathway', 'select', '["uni_assist","direct"]', null, null, null, null, 10),
('DE', 'vpd_status', 'VPD status', 'text', null, null, null, null, null, 20),
('DE', 'hec_attested_degree_uploaded', 'HEC-attested degree uploaded', 'boolean', null, null, null, null, null, 30),
('DE', 'language_certificate', 'Language certificate type & score', 'text', null, null, null, null, null, 40),
('DE', 'blocked_account_status', 'Blocked account status', 'text', null, null, null, null, null, 50),
('DE', 'uni_assist_status', 'Uni-assist / application status', 'text', null, null, null, null, null, 60),
('DE', 'admission_letter_status', 'Admission letter (Zulassungsbescheid) status', 'text', null, null, null, null, null, 70),

-- Austria (unchanged)
('AT', 'studienplatznachweis_status', 'Studienplatznachweis status', 'text', null, null, null, null, null, 10),
('AT', 'attestation_status', 'IBCC / HEC / MOFA attestation status', 'text', null, null, null, null, null, 20),
('AT', 'erganzungsprufung_required', 'Ergänzungsprüfung required', 'boolean', null, null, null, null, null, 30),
('AT', 'language_certificate', 'Language certificate', 'text', null, null, null, null, null, 40),
('AT', 'application_status', 'Application status', 'text', null, null, null, null, null, 50),
('AT', 'admission_letter_status', 'Admission letter status', 'text', null, null, null, null, null, 60),

-- France (unchanged)
('FR', 'eef_track', 'EeF application track', 'select', '["candidature","pre_consular"]', null, null, null, null, 10),
('FR', 'academic_interview_date', 'Academic interview date', 'date', null, null, null, null, null, 20),
('FR', 'academic_interview_outcome', 'Academic interview outcome', 'text', null, null, null, null, null, 30),
('FR', 'attestation_status', 'IBCC / HEC attestation status', 'text', null, null, null, null, null, 40),
('FR', 'language_certificate', 'Language certificate', 'text', null, null, null, null, null, 50),
('FR', 'university_response_status', 'University response status', 'text', null, null, null, null, null, 60),
('FR', 'visa_status', 'Visa status', 'text', null, null, null, null, null, 70),

-- Hungary (unchanged)
('HU', 'program', 'Program', 'text', null, null, null, null, null, 10),
('HU', 'application_status', 'Application status', 'text', null, null, null, null, null, 20),
('HU', 'language_certificate', 'Language certificate', 'text', null, null, null, null, null, 30),
('HU', 'document_attestation_status', 'Document attestation status', 'text', null, null, null, null, null, 40),
('HU', 'admission_decision', 'Admission decision', 'text', null, null, null, null, null, 50),
('HU', 'visa_status', 'Visa status', 'text', null, null, null, null, null, 60),

-- Luxembourg (unchanged)
('LU', 'program', 'Program', 'text', null, null, null, null, null, 10),
('LU', 'diploma_equivalence_status', 'Diploma equivalence recognition status', 'text', null, null, null, null, null, 20),
('LU', 'language_certificate', 'Language certificate', 'text', null, null, null, null, null, 30),
('LU', 'application_status', 'Application status', 'text', null, null, null, null, null, 40),
('LU', 'admission_decision', 'Admission decision', 'text', null, null, null, null, null, 50),
('LU', 'visa_status', 'Visa status', 'text', null, null, null, null, null, 60),

-- United Kingdom (new)
('UK', 'bank_statement_category', 'Bank statement category', 'select', '["London","Outside London"]', null, null, null, null, 10),
('UK', 'bank_statement_amount', 'Bank statement amount', 'number', null, null, null, null, null, 20),
('UK', 'credibility_interview', 'University credibility interview', 'multi_university_status', '["Pending","Booked","Rejected"]', null, null, null, 'Booked', 30),
('UK', 'unconditional_offer_status', 'Unconditional offer', 'select', '["Issued","Rejected","Pending"]', null, null, null, null, 40),
('UK', 'finalized_university', 'Finalized university (for visa / CAS)', 'select', '[]', null, null, null, null, 50),
('UK', 'cas_letter_status', 'CAS letter status', 'select', '["Issued","Pending","Rejected"]', null, 'finalized_university', '*', null, 60),

-- United States (new)
('US', 'bank_statement_required', 'Bank statement required (per university)', 'multi_university_status', '["Yes","No"]', null, null, null, null, 10),
('US', 'unconditional_offer_status', 'Unconditional offer', 'select', '["Issued","Rejected","Pending"]', null, null, null, null, 20),
('US', 'finalized_university', 'Finalized university (for visa / I-20)', 'select', '[]', null, null, null, null, 30),
('US', 'i20_letter_status', 'I-20 letter status', 'select', '["Issued","Pending","Rejected"]', null, 'finalized_university', '*', null, 40)
on conflict (country_code, field_key) do nothing;
