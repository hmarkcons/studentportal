-- Working hours, and what late, absent and overtime are worth.
--
-- attendance_records has held clock-ins since 0017 and nothing has ever been
-- able to say whether one was late: there were no office hours on file to be
-- late against. late_flag has sat on every row, written by nothing and shown
-- nowhere, for exactly that reason.
--
-- Hours are per staff member, because they differ per person — a schedule set
-- once for the whole office would be wrong for anybody on a different shift.
-- The organisation-wide row holds the defaults everyone falls back to, plus
-- the grace period and the money, so a new joiner is covered without anybody
-- filling in a form.
--
-- Nothing here invents a number. The rates default to zero and the default
-- hours to null, so until somebody sets them the payroll counts hours and
-- says the rates are not configured, rather than quietly paying nothing at a
-- rate nobody agreed.

create table if not exists attendance_policy (
  id boolean primary key default true,
  -- The hours a staff member without their own schedule is held to.
  work_start_time time,
  work_end_time time,
  -- 0 = Sunday … 6 = Saturday. Karachi's ordinary week, and settable.
  work_days smallint[] not null default '{1,2,3,4,5,6}',
  -- How late is still on time. Fifteen minutes is a starting point, not a
  -- rule anybody here agreed — it is on the settings page to be changed.
  grace_minutes int not null default 15,
  -- All three are per staff member's own currency (staff.currency), and all
  -- three are zero until set: no money moves on a rate nobody chose.
  overtime_rate_per_hour numeric(12, 2) not null default 0,
  late_deduction numeric(12, 2) not null default 0,
  absent_deduction numeric(12, 2) not null default 0,
  updated_at timestamptz not null default now(),
  updated_by uuid references staff (id) on delete set null,
  constraint attendance_policy_singleton check (id),
  constraint attendance_policy_grace_check check (grace_minutes >= 0 and grace_minutes <= 240),
  constraint attendance_policy_rates_check check (
    overtime_rate_per_hour >= 0 and late_deduction >= 0 and absent_deduction >= 0
  ),
  constraint attendance_policy_hours_order check (
    work_start_time is null or work_end_time is null or work_end_time > work_start_time
  )
);

insert into attendance_policy (id) values (true) on conflict do nothing;

alter table attendance_policy enable row level security;

-- Everyone can see the hours they are held to; only Super Admin sets them.
drop policy if exists "attendance_policy_select" on attendance_policy;
create policy "attendance_policy_select" on attendance_policy
  for select using (is_active_staff());

drop policy if exists "attendance_policy_write" on attendance_policy;
create policy "attendance_policy_write" on attendance_policy
  for all
  using (has_role(array['super_admin']::staff_role[]))
  with check (has_role(array['super_admin']::staff_role[]));

-- ------------------------------------------------------- per staff member
-- Null means "use the policy", so a schedule only has to be filled in for
-- somebody who actually differs from it.
alter table staff add column if not exists work_start_time time;
alter table staff add column if not exists work_end_time time;
alter table staff add column if not exists work_days smallint[];

alter table staff drop constraint if exists staff_work_hours_order;
alter table staff
  add constraint staff_work_hours_order
  check (work_start_time is null or work_end_time is null or work_end_time > work_start_time);

comment on column staff.work_start_time is
  'When this person is due in. Null falls back to attendance_policy.work_start_time.';
comment on column staff.work_days is
  '0 = Sunday … 6 = Saturday. Null falls back to attendance_policy.work_days.';
