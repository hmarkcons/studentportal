-- A counsellor sells; processing processes. After registration, a
-- counsellor follows their student's progress but does not change it.
--
-- Until now every write policy on a student's processing work used
-- staff_can_view_student(), which is true for the student's assigned
-- counsellor at every stage. So a counsellor could add applications, move an
-- application's stage, accept or reject documents, book interviews and tick
-- off country stages for a student processing had taken over — the work of
-- the admissions, documentation and visa team.
--
-- staff_can_process_student() is the same rule with one difference: the
-- assigned counsellor qualifies only while the student is not yet registered
-- (registered_at is null — the students view's own test). Before
-- registration nothing changes for anyone. Processing, Management, Super Admin
-- and Finance keep exactly what they had.
--
-- Reading is unchanged: the counsellor still sees their student, and the
-- student's record shows them the country stages, contact details and
-- messages only (src/lib/auth/studentAccess.ts). This is the lock underneath
-- that view.
--
-- Changed:
--   applications            insert, update
--   application_tasks       write
--   application_interviews  write
--   student_documents       staff write (and the 0001 policy, if it is still
--                           there, which let the assigned counsellor write at
--                           any stage through the old students view)
--   lead_destinations       the country-stage values only, by trigger. The
--                           rows themselves stay writable as before, because
--                           registering a student — by hand, by import, or by
--                           correcting the registration — writes which
--                           countries they are going to, as the counsellor,
--                           just after marking them registered. Which country
--                           is part of the sale; how far along it is, is not.
--
-- Not changed: scholarships and the country trackers (visa, appointments)
-- were already processing and Super Admin only (0012).

do $$
begin
  if to_regprocedure('public.has_role(staff_role[])') is null then
    raise exception '0276: public.has_role(staff_role[]) is missing (0247)';
  end if;
  if to_regclass('public.lead_destinations') is null or to_regclass('public.student_documents') is null then
    raise exception '0276: lead_destinations or student_documents is missing';
  end if;
end $$;

create or replace function public.staff_can_process_student(p_student_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.leads l
    where l.id = p_student_id
      and (
        public.has_role(array['management', 'super_admin', 'processing', 'finance']::staff_role[])
        or (l.assigned_counselor_id = auth.uid() and l.registered_at is null)
      )
  );
$$;

comment on function public.staff_can_process_student(uuid) is
  'May change this student''s processing work (applications, tasks, interviews, documents, country-stage progress): Processing, Management, Super Admin and Finance always; the assigned counsellor only until the student is registered.';

-- ------------------------------------------------------------ applications
drop policy if exists "applications_insert" on applications;
create policy "applications_insert" on applications for insert
  with check (staff_can_process_student(student_id));

drop policy if exists "applications_update" on applications;
create policy "applications_update" on applications for update
  using (staff_can_process_student(student_id))
  with check (staff_can_process_student(student_id));

-- ------------------------------------------------------- application_tasks
drop policy if exists "application_tasks_write" on application_tasks;
create policy "application_tasks_write" on application_tasks for all
  using (exists (
    select 1 from applications a
    where a.id = application_tasks.application_id and staff_can_process_student(a.student_id)
  ))
  with check (exists (
    select 1 from applications a
    where a.id = application_tasks.application_id and staff_can_process_student(a.student_id)
  ));

-- -------------------------------------------------- application_interviews
drop policy if exists "application_interviews_write" on application_interviews;
create policy "application_interviews_write" on application_interviews for all
  using (exists (
    select 1 from applications a
    where a.id = application_interviews.application_id and staff_can_process_student(a.student_id)
  ))
  with check (exists (
    select 1 from applications a
    where a.id = application_interviews.application_id and staff_can_process_student(a.student_id)
  ));

-- ------------------------------------------------------- student_documents
-- The student's own uploads (student_documents_upload_self) and a partner's
-- letters (student_documents_insert_partner) are separate policies, untouched.
drop policy if exists "student_documents_write" on student_documents;
drop policy if exists "student_documents_staff_write" on student_documents;
create policy "student_documents_staff_write" on student_documents for all
  using (staff_can_process_student(student_id))
  with check (staff_can_process_student(student_id));

-- ------------------------------------------ lead_destinations: stage values
create or replace function public.guard_lead_destination_stages()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- No signed-in user: the server itself, or someone at the database.
  if auth.uid() is null then
    return coalesce(new, old);
  end if;

  -- A country added with progress already on it: correcting a registration
  -- re-inserts the student's countries with the progress they had.
  if tg_op = 'INSERT'
     and coalesce(new.dashboard_stage_values, '{}'::jsonb) <> '{}'::jsonb
     and not public.staff_can_process_student(new.lead_id) then
    raise exception 'Only the processing team can record a registered student''s country stages.'
      using errcode = '42501';
  end if;

  if tg_op = 'UPDATE'
     and new.dashboard_stage_values is distinct from old.dashboard_stage_values
     and not public.staff_can_process_student(new.lead_id) then
    raise exception 'Only the processing team can change a registered student''s country stages.'
      using errcode = '42501';
  end if;

  -- Removing a destination that has progress on it throws that progress away.
  if tg_op = 'DELETE'
     and coalesce(old.dashboard_stage_values, '{}'::jsonb) <> '{}'::jsonb
     and not public.staff_can_process_student(old.lead_id) then
    raise exception 'Only the processing team can remove a country that has stage progress recorded.'
      using errcode = '42501';
  end if;

  return coalesce(new, old);
end;
$$;

drop trigger if exists trg_lead_destination_stages_guard on public.lead_destinations;
create trigger trg_lead_destination_stages_guard
  before insert or update or delete on public.lead_destinations
  for each row execute function public.guard_lead_destination_stages();
