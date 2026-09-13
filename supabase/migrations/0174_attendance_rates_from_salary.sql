-- Attendance is priced from each person's own salary, not from flat amounts.
--
-- 0168 gave the policy three rupee figures: an overtime rate per hour, a late
-- deduction and an absent deduction, the same three for everybody. Salaries
-- here run from 45,000 to 100,000, so the same ₨500 is trivial against one and
-- heavy against another for the identical lateness. The office's answer is to
-- price all three from the person: a day absent costs a day of their pay, an
-- hour of overtime pays their own hourly rate, and lateness is charged by the
-- minute.
--
-- That leaves nothing for late_deduction and absent_deduction to mean, and it
-- changes what the overtime column is: a multiplier on the person's hourly
-- rate rather than a number of rupees. Renaming it matters more than it looks
-- — the production value is 0 today, but somebody typing 200 into a field
-- still called "rate per hour" would have bought a 200× multiplier.

alter table public.attendance_policy
  add column if not exists overtime_multiplier numeric(4, 2) not null default 1;

comment on column public.attendance_policy.overtime_multiplier is
  'What an overtime hour pays as a multiple of that person''s own hourly rate (monthly salary / their scheduled days this month / hours in their day). 1 = normal time, 1.5 = time and a half.';

alter table public.attendance_policy drop constraint if exists attendance_policy_overtime_multiplier_check;
alter table public.attendance_policy
  add constraint attendance_policy_overtime_multiplier_check
  check (overtime_multiplier >= 0 and overtime_multiplier <= 5);

alter table public.attendance_policy
  drop column if exists overtime_rate_per_hour,
  drop column if exists late_deduction,
  drop column if exists absent_deduction;

-- ------------------------------------------------------------- the office day
-- 12:00 to 21:00, Monday to Saturday, with fifteen minutes' grace, as the
-- office gave them. Anyone on different hours gets their own on their staff
-- record; these are only the default everybody falls back to.
update public.attendance_policy
set
  work_start_time = '12:00:00',
  work_end_time = '21:00:00',
  work_days = array[1, 2, 3, 4, 5, 6],
  grace_minutes = 15,
  overtime_multiplier = 1
where id = true;

-- The singleton may not exist on a fresh database.
insert into public.attendance_policy (id, work_start_time, work_end_time, work_days, grace_minutes, overtime_multiplier)
values (true, '12:00:00', '21:00:00', array[1, 2, 3, 4, 5, 6], 15, 1)
on conflict (id) do nothing;
