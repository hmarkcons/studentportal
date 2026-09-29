-- The calendar as Google Calendar does it: an end time, a place, a
-- notification, and two more ways to repeat.
--
-- Until now an item had a start time and nothing else, so every timed block on
-- the hour grid was drawn an hour long whatever it was, and "6 to 7:30" could
-- not be said at all. The editor now asks for:
--
--   end_time        the time it ends. On the start day when end_date is empty
--                   or the same day; otherwise on end_date. Null means "no end
--                   given", which the grid draws as an hour.
--   location        free text, as Google has it -- an office, a room, a link.
--   notify_minutes  how long before the start to remind the owner, in
--                   minutes; null means no reminder. 0 is "at the time of the
--                   event". Capped at four weeks, the most Google offers. The
--                   reminder is shown by the portal while it is open (see
--                   src/components/CalendarNotifier.tsx); a daily cron cannot
--                   say "in 30 minutes".
--
-- and recurrence gains 'yearly' and 'weekdays' (Monday to Friday) beside the
-- none / daily / weekly / monthly that 0072 allowed.
--
-- Safe to run twice. Nothing here rewrites a row: the new columns are nullable
-- with no default, and the widened recurrence check accepts every value the old
-- one did, which the precondition below proves before anything changes.

do $$
declare
  v_bad int;
begin
  select count(*) into v_bad from public.application_tasks
   where recurrence not in ('none', 'daily', 'weekly', 'monthly', 'yearly', 'weekdays');
  if v_bad > 0 then
    raise exception 'application_tasks has % rows with a recurrence the new check would refuse', v_bad;
  end if;
  select count(*) into v_bad from public.personal_tasks
   where recurrence not in ('none', 'daily', 'weekly', 'monthly', 'yearly', 'weekdays');
  if v_bad > 0 then
    raise exception 'personal_tasks has % rows with a recurrence the new check would refuse', v_bad;
  end if;
end $$;

alter table public.application_tasks
  add column if not exists end_time time,
  add column if not exists location text,
  add column if not exists notify_minutes integer;

alter table public.personal_tasks
  add column if not exists end_time time,
  add column if not exists location text,
  add column if not exists notify_minutes integer;

-- The recurrence checks were written inline in 0072 ("add column ... check
-- (...)"), so Postgres named them itself: application_tasks_recurrence_check
-- and personal_tasks_recurrence_check. Rather than trust that, every check
-- constraint that reads the recurrence column and lists its values is found
-- through pg_constraint and dropped, so a differently named one cannot
-- survive beside the new check and go on refusing 'yearly'. Only a list of
-- values ('monthly' in it) is dropped: any other rule about the column stays.
do $$
declare
  r record;
begin
  for r in
    select c.conname, t.relname
      from pg_constraint c
      join pg_class t on t.oid = c.conrelid
      join pg_namespace n on n.oid = t.relnamespace
      join pg_attribute a on a.attrelid = t.oid and a.attname = 'recurrence'
     where n.nspname = 'public'
       and t.relname in ('application_tasks', 'personal_tasks')
       and c.contype = 'c'
       and a.attnum = any (c.conkey)
       and pg_get_constraintdef(c.oid) like '%''monthly''%'
  loop
    execute format('alter table public.%I drop constraint %I', r.relname, r.conname);
  end loop;
end $$;

alter table public.application_tasks
  add constraint application_tasks_recurrence_check
    check (recurrence in ('none', 'daily', 'weekly', 'monthly', 'yearly', 'weekdays'));
alter table public.personal_tasks
  add constraint personal_tasks_recurrence_check
    check (recurrence in ('none', 'daily', 'weekly', 'monthly', 'yearly', 'weekdays'));

-- Dropped first so a re-run replaces them rather than failing on the name.
alter table public.application_tasks drop constraint if exists application_tasks_notify_minutes_check;
alter table public.application_tasks
  add constraint application_tasks_notify_minutes_check
    check (notify_minutes is null or notify_minutes between 0 and 40320);
alter table public.personal_tasks drop constraint if exists personal_tasks_notify_minutes_check;
alter table public.personal_tasks
  add constraint personal_tasks_notify_minutes_check
    check (notify_minutes is null or notify_minutes between 0 and 40320);

alter table public.application_tasks drop constraint if exists application_tasks_location_length_check;
alter table public.application_tasks
  add constraint application_tasks_location_length_check
    check (location is null or char_length(location) <= 500);
alter table public.personal_tasks drop constraint if exists personal_tasks_location_length_check;
alter table public.personal_tasks
  add constraint personal_tasks_location_length_check
    check (location is null or char_length(location) <= 500);

comment on column public.application_tasks.end_time is
  'When it ends: on due_date, or on end_date for a multi-day item. Null draws as an hour (0295).';
comment on column public.application_tasks.location is 'Where, as free text (0295).';
comment on column public.application_tasks.notify_minutes is
  'Minutes before the start to remind the owner while the portal is open; null = none (0295).';
comment on column public.personal_tasks.end_time is
  'When it ends: on due_date, or on end_date for a multi-day item. Null draws as an hour (0295).';
comment on column public.personal_tasks.location is 'Where, as free text (0295).';
comment on column public.personal_tasks.notify_minutes is
  'Minutes before the start to remind the owner while the portal is open; null = none (0295).';

-- The notifier asks for one person's items with a reminder set, every few
-- minutes while they have the portal open.
create index if not exists personal_tasks_owner_notify_idx
  on public.personal_tasks (owner_id, due_date) where notify_minutes is not null and status = 'pending';
create index if not exists application_tasks_owner_notify_idx
  on public.application_tasks (owner_id, due_date) where notify_minutes is not null and status = 'pending';
