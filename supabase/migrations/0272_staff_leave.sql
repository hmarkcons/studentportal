-- Staff leave, so payroll stops deducting it.
--
-- Payroll counts every scheduled working day with no attendance record as an
-- absence and pre-fills a day's deduction for it (attendancePayroll.ts). Leave
-- was never recorded anywhere, so approved leave was deducted like any
-- absence, and so were public holidays — while the staff agreement says
-- approved leave is paid (sample template, clause 6).
--
--   leave_requests    a staff member's request, or leave recorded for them,
--                     and the decision on it. On approval the exact dates are
--                     fixed as paid_dates and unpaid_dates, and payroll reads
--                     those — never re-derives them — so a later change to
--                     someone's hours or to the holiday list cannot quietly
--                     rewrite a month already paid.
--   office_holidays   days nobody works: never an absence, never leave.
--   staff.joined_on   the anniversary each person's leave year runs from.
--   attendance_policy.annual_leave_days   the allowance, 14 by default.
--
-- Approving is a new permission, leave.approve — Management and Super Admin
-- by default, grantable to any role on the Role Permissions screen — and
-- nobody may decide their own request, which the policies below enforce.
--
-- Refuses to run if what it builds on is missing.

do $$
begin
  if to_regprocedure('public.staff_has_permission(text)') is null then
    raise exception '0272: public.staff_has_permission(text) is missing (0095)';
  end if;
  if to_regclass('public.attendance_policy') is null then
    raise exception '0272: public.attendance_policy is missing (0168)';
  end if;
end $$;

-- ------------------------------------------------------------ permission

insert into public.permission_definitions (key, category, label, description, default_roles, sort_order) values
  ('leave.approve', 'Staff & HR', 'Approve staff leave',
   'Approve or reject staff leave requests and record leave on a staff member''s behalf. Nobody can decide their own.',
   array['management', 'super_admin']::staff_role[], 45)
on conflict (key) do nothing;

-- ------------------------------------------------------------ the allowance

alter table public.attendance_policy
  add column if not exists annual_leave_days integer not null default 14
    check (annual_leave_days between 0 and 366);

comment on column public.attendance_policy.annual_leave_days is
  'Paid leave days each staff member has in each year of employment, counted from staff.joined_on.';

-- ------------------------------------------------------------ joining date

alter table public.staff add column if not exists joined_on date;

comment on column public.staff.joined_on is
  'When they joined. Their leave year runs from each anniversary of it.';

-- Backfilled, not left empty: a leave year needs a start. Their first signed
-- staff agreement is the best evidence of when they started; failing that,
-- when their account was created. Either can be corrected on their record.
update public.staff s
set joined_on = coalesce(
  (select min(coalesce(a.verified_at, a.created_at))::date
     from public.staff_agreements a
    where a.staff_id = s.id and a.status = 'signed'),
  s.created_at::date
)
where s.joined_on is null;

-- ------------------------------------------------------------ holidays

create table if not exists public.office_holidays (
  holiday_date date primary key,
  name text not null check (btrim(name) <> ''),
  created_by uuid references public.staff (id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.office_holidays enable row level security;

drop policy if exists "office_holidays_select" on public.office_holidays;
create policy "office_holidays_select" on public.office_holidays for select using (public.is_active_staff());

-- The same hands as the attendance policy the holidays belong with.
drop policy if exists "office_holidays_write" on public.office_holidays;
create policy "office_holidays_write" on public.office_holidays for all
  using (public.staff_has_permission('attendance.qr_admin'))
  with check (public.staff_has_permission('attendance.qr_admin'));

-- ------------------------------------------------------------ leave

create table if not exists public.leave_requests (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid not null references public.staff (id) on delete cascade,
  kind text not null check (kind in ('planned', 'sick', 'emergency')),
  start_date date not null,
  end_date date not null,
  reason text,
  certificate_path text,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'cancelled')),
  -- Fixed on approval: which working days are paid from the allowance and
  -- which are not. Payroll reads these as they are.
  paid_dates date[] not null default '{}',
  unpaid_dates date[] not null default '{}',
  decision_note text,
  decided_by uuid references public.staff (id) on delete set null,
  decided_at timestamptz,
  -- Who entered it: the staff member, or an approver recording it for them.
  created_by uuid references public.staff (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint leave_requests_dates_in_order check (end_date >= start_date),
  constraint leave_requests_decided check (status in ('pending', 'cancelled') or decided_at is not null)
);

create index if not exists leave_requests_staff_idx on public.leave_requests (staff_id, start_date);
create index if not exists leave_requests_pending_idx on public.leave_requests (status) where status = 'pending';

drop trigger if exists trg_leave_requests_updated_at on public.leave_requests;
create trigger trg_leave_requests_updated_at
  before update on public.leave_requests
  for each row execute function public.set_updated_at();

alter table public.leave_requests enable row level security;

-- Their own; anyone who approves leave; and Finance and Super Admin, whose
-- payroll counts approved leave as paid.
drop policy if exists "leave_requests_select" on public.leave_requests;
create policy "leave_requests_select" on public.leave_requests for select
  using (
    staff_id = auth.uid()
    or public.staff_has_permission('leave.approve')
    or public.has_role(array['finance', 'super_admin']::staff_role[])
  );

-- A staff member asks for their own leave, as a pending request they made.
-- An approver records leave for someone else — never for themselves.
drop policy if exists "leave_requests_insert" on public.leave_requests;
create policy "leave_requests_insert" on public.leave_requests for insert
  with check (
    (staff_id = auth.uid() and status = 'pending' and created_by = auth.uid())
    or (public.staff_has_permission('leave.approve') and staff_id <> auth.uid())
  );

-- An approver decides someone else's request. A staff member may change or
-- cancel their own only while it is still pending, and may not approve it.
drop policy if exists "leave_requests_update" on public.leave_requests;
create policy "leave_requests_update" on public.leave_requests for update
  using (
    (public.staff_has_permission('leave.approve') and staff_id <> auth.uid())
    or (staff_id = auth.uid() and status = 'pending')
  )
  with check (
    (public.staff_has_permission('leave.approve') and staff_id <> auth.uid())
    or (staff_id = auth.uid() and status in ('pending', 'cancelled'))
  );
-- No delete policy: leave is history payroll has been paid on.

-- Two leave requests may not cover the same day for one person, unless one
-- of them is out of the picture (rejected or cancelled).
create or replace function public.leave_requests_no_overlap() returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.status in ('pending', 'approved') and exists (
    select 1 from public.leave_requests o
    where o.staff_id = new.staff_id
      and o.id <> new.id
      and o.status in ('pending', 'approved')
      and daterange(o.start_date, o.end_date, '[]') && daterange(new.start_date, new.end_date, '[]')
  ) then
    raise exception 'These dates overlap leave already requested or approved.';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_leave_requests_no_overlap on public.leave_requests;
create trigger trg_leave_requests_no_overlap
  before insert or update on public.leave_requests
  for each row execute function public.leave_requests_no_overlap();

-- ------------------------------------------------------------ certificates
--
-- leave-certificates/<staff id>/… — the staff member adds and reads their own;
-- approvers read everyone's. Nobody rewrites one once it is filed.

drop policy if exists "documents_storage_leave_certificates_own" on storage.objects;
create policy "documents_storage_leave_certificates_own" on storage.objects for select
  using (
    bucket_id = 'documents'
    and (storage.foldername(name))[1] = 'leave-certificates'
    and (storage.foldername(name))[2] = auth.uid()::text
  );

drop policy if exists "documents_storage_leave_certificates_own_insert" on storage.objects;
create policy "documents_storage_leave_certificates_own_insert" on storage.objects for insert
  with check (
    bucket_id = 'documents'
    and (storage.foldername(name))[1] = 'leave-certificates'
    and (storage.foldername(name))[2] = auth.uid()::text
  );

drop policy if exists "documents_storage_leave_certificates_approvers" on storage.objects;
create policy "documents_storage_leave_certificates_approvers" on storage.objects for all
  using (
    bucket_id = 'documents'
    and (storage.foldername(name))[1] = 'leave-certificates'
    and public.staff_has_permission('leave.approve')
  )
  with check (
    bucket_id = 'documents'
    and (storage.foldername(name))[1] = 'leave-certificates'
    and public.staff_has_permission('leave.approve')
  );
