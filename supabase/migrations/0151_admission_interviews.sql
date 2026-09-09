-- Admission interviews: several rounds per application, a timezone the quoted
-- time actually belongs to, and login credentials the student sees only when
-- staff say so.
--
-- application_interviews existed and held no rows. It carried one interview per
-- application, free-text university and program names duplicating what the
-- application already knows, and a slot-offering field that nothing ever wrote.
-- Nothing on the student side read it at all, even though the portal's
-- Appointments page has always promised "a visa appointment, an interview — it
-- will appear here".
--
-- Because the table is empty, this reshapes it rather than layering on top.

-- ---------------------------------------------------------------- rounds
-- A university can interview twice: a departmental round then a panel. One row
-- per application meant the second overwrote the first and lost what happened
-- at it.
-- The unique index backs a UNIQUE constraint, so the constraint is what has to
-- go; dropping the index directly is refused because the constraint requires it.
alter table public.application_interviews
  drop constraint if exists application_interviews_application_id_key;
create index if not exists application_interviews_application_id_idx
  on public.application_interviews (application_id);

-- The application already knows its university and program through real
-- relations, so these were two more places for the same fact to be wrong.
-- available_slots went with the decision that staff set the confirmed time
-- rather than offering slots for the student to choose between; leaving it
-- would be an invitation to half-build that later.
alter table public.application_interviews drop column if exists university_name;
alter table public.application_interviews drop column if exists program_name;
alter table public.application_interviews drop column if exists available_slots;

alter table public.application_interviews
  add column if not exists round_label text not null default 'Interview';

-- The IANA zone the university quoted the time in. confirmed_datetime is an
-- instant, which is correct but says nothing about whose clock the number came
-- off — and "14:00" from a university in Rome is 18:00 to a student in Karachi.
-- Storing the zone is what lets both readings be shown instead of staff
-- converting by hand and a mistake going unnoticed until somebody misses an
-- interview.
alter table public.application_interviews add column if not exists timezone text;

alter table public.application_interviews add column if not exists platform text;
alter table public.application_interviews add column if not exists platform_other text;

alter table public.application_interviews
  add column if not exists status text not null default 'scheduled';
alter table public.application_interviews drop constraint if exists application_interviews_status_check;
alter table public.application_interviews
  add constraint application_interviews_status_check
  check (status in ('scheduled', 'completed', 'passed', 'failed', 'rescheduled', 'cancelled'));

alter table public.application_interviews drop constraint if exists application_interviews_platform_check;
alter table public.application_interviews
  add constraint application_interviews_platform_check
  check (
    platform is null
    or platform in ('zoom', 'microsoft_teams', 'google_meet', 'skype', 'whatsapp', 'phone', 'in_person', 'other')
  );

-- What the student should do to get ready, kept apart from interview_details so
-- staff can describe the interview and tell the student what to bring without
-- the two running together.
alter table public.application_interviews add column if not exists preparation_notes text;

-- Who scheduled it. ON DELETE SET NULL, like audit_log.actor_id in 0136 and
-- inventory_requests.requested_by in 0150: the record outlives the person.
alter table public.application_interviews
  add column if not exists created_by uuid references public.staff (id) on delete set null;

-- --------------------------------------------------------- credentials
-- A separate table because "show it to the student only if required" cannot be
-- done by leaving a column out of a query. The student already has SELECT on
-- their interview row through application_interviews_select, so anything stored
-- there is readable by them whatever the app chooses to display — they hold a
-- session and could ask for it directly. Row-level security can gate a row but
-- not a column, so the credentials need a row of their own with a policy that
-- names the share flag.
create table if not exists public.application_interview_credentials (
  interview_id uuid primary key references public.application_interviews (id) on delete cascade,
  login_username text,
  login_password text,
  login_instructions text,
  -- Default false: nothing reaches a student until somebody decides it should.
  share_with_student boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.application_interview_credentials enable row level security;

drop policy if exists application_interview_credentials_select on public.application_interview_credentials;
create policy application_interview_credentials_select on public.application_interview_credentials
  for select using (
    exists (
      select 1
      from public.application_interviews i
      join public.applications a on a.id = i.application_id
      where i.id = application_interview_credentials.interview_id
        and (
          staff_can_view_student(a.student_id)
          or (is_own_student(a.student_id) and application_interview_credentials.share_with_student)
        )
    )
  );

-- Writes are Super Admin and Processing, per the brief, and enforced here as
-- well as in the action so the floor does not depend on the app layer.
drop policy if exists application_interview_credentials_write on public.application_interview_credentials;
create policy application_interview_credentials_write on public.application_interview_credentials
  for all using (
    has_role(array['processing', 'super_admin']::staff_role[])
    and exists (
      select 1
      from public.application_interviews i
      join public.applications a on a.id = i.application_id
      where i.id = application_interview_credentials.interview_id and staff_can_view_student(a.student_id)
    )
  )
  with check (
    has_role(array['processing', 'super_admin']::staff_role[])
    and exists (
      select 1
      from public.application_interviews i
      join public.applications a on a.id = i.application_id
      where i.id = application_interview_credentials.interview_id and staff_can_view_student(a.student_id)
    )
  );

-- The interview itself: scheduling one was open to any staff member who could
-- see the student, including a counselor. The brief puts it with Super Admin
-- and Processing.
drop policy if exists application_interviews_write on public.application_interviews;
create policy application_interviews_write on public.application_interviews
  for all using (
    has_role(array['processing', 'super_admin']::staff_role[])
    and exists (
      select 1 from public.applications a
      where a.id = application_interviews.application_id and staff_can_view_student(a.student_id)
    )
  )
  with check (
    has_role(array['processing', 'super_admin']::staff_role[])
    and exists (
      select 1 from public.applications a
      where a.id = application_interviews.application_id and staff_can_view_student(a.student_id)
    )
  );
