-- Mark a tracker date field as an appointment, so the student's Appointments
-- tab and the staff Calendar can find it.
--
-- Both of those currently read visa_records, which is the pre-tracker system:
-- the form that writes it is no longer linked from anywhere and the table holds
-- zero rows. So the student's Appointments tab could only ever say "No
-- appointments scheduled yet" while the actual appointment date sat in the
-- documentation tracker, and the Calendar showed no visa appointments at all.
--
-- Appointments now come from the same place as everything else on the Visa
-- tab. A boolean rather than a visa_role value, because a country can have
-- several appointments (biometrics, interview, medical) and visa_role is
-- constrained to one row per country.

alter table tracker_definitions
  add column if not exists is_appointment boolean not null default false;

-- Seed the date fields that are already appointments in the trackers built so
-- far. Narrow on purpose: only genuine appointment dates, not every date
-- field — a stipend ranking date is a deadline, not something a student turns
-- up to.
update tracker_definitions
   set is_appointment = true
 where field_type = 'date'
   and (country_code, field_key) in (
     ('IT', 'visa_appointment_date'),
     ('FR', 'academic_interview_date')
   );

-- An appointment is only meaningful as a date. Anything else would give the
-- Appointments tab a value it cannot sort or count down to.
alter table tracker_definitions
  drop constraint if exists tracker_definitions_appointment_is_date;

alter table tracker_definitions
  add constraint tracker_definitions_appointment_is_date
  check (not is_appointment or field_type = 'date');

create index if not exists tracker_definitions_appointment_idx
  on tracker_definitions (country_code) where is_appointment;
