-- Where a scholarship application's documents stand, beside the application's
-- own status.
--
-- A regional scholarship is decided on paper as much as on the form: the
-- ISEE, the family income and property certificates, sometimes originals by
-- courier. The office tracked that in their heads. Now each scholarship record
-- says it, chosen from a short list on the student's Scholarship tab:
--
--   pending        Pending — not sent yet
--   submitted      Submitted — uploaded to the agency's portal
--   courier        Sent via courier — the originals are on their way
--   not_required   Upload not required — this body asks for none
--   on_arrival     To be submitted upon arrival — handed in once in the country
--
-- Null until somebody chooses: a record added before this existed has not
-- been looked at, and "Pending" would be a guess. The student reads it on
-- their own Scholarship page, where their record is already visible (0149).

alter table public.student_scholarships add column if not exists documents_status text;

alter table public.student_scholarships drop constraint if exists student_scholarships_documents_status_check;
alter table public.student_scholarships
  add constraint student_scholarships_documents_status_check
  check (documents_status is null or documents_status in ('pending', 'submitted', 'courier', 'not_required', 'on_arrival'));

comment on column public.student_scholarships.documents_status is
  'pending | submitted | courier | not_required | on_arrival — where the application''s documents stand (0297). Null until chosen.';

notify pgrst, 'reload schema';
