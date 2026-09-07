-- The student Visa tab is sourced entirely from the documentation tracker, so
-- the tracker has to say which of its fields belong there. Every country has
-- its own tracker and its own workflow, and staff add more countries in
-- Setup › Document trackers — so this is configuration, not a hardcoded list
-- of field keys that would silently miss any country added later.

alter table tracker_definitions
  -- Fields the registered student sees on their Visa tab, read-only.
  add column if not exists show_on_student_visa boolean not null default false,
  -- Marks the one field per country that carries the visa decision, and the
  -- one holding the reason. Drives the approval / refusal message.
  add column if not exists visa_role text
    check (visa_role is null or visa_role in ('outcome', 'outcome_reason'));

-- At most one outcome field and one reason field per country: two competing
-- "outcome" fields would make the student's message ambiguous.
create unique index if not exists tracker_definitions_one_visa_role_per_country
  on tracker_definitions (country_code, visa_role)
  where visa_role is not null;

-- Seed the fields that already exist and clearly belong on the Visa tab, so
-- the tab is not blank for the countries configured today. Anything added
-- later is opted in from Setup.
update tracker_definitions
   set show_on_student_visa = true
 where field_key in (
   'visa_appointment_status', 'visa_appointment_date', 'visa_application_submitted',
   'visa_status', 'visa_docs_status', 'credibility_interview',
   'academic_interview_date', 'academic_interview_outcome'
 );

-- The loose per-country status fields are the closest thing to a decision that
-- exists today; mark them as the outcome so the messaging has something to
-- read. Staff can move the role to a purpose-built field once they add one.
update tracker_definitions
   set visa_role = 'outcome'
 where field_key = 'visa_status'
   and country_code in ('FR', 'HU', 'LU');
