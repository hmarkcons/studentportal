-- Let a programme carry more than one intake round.
--
-- 0216 gave programs a single start_date to sit alongside the existing
-- application_deadline, on the basis that a programme has one course start and
-- one closing date. Real admissions do not work that way: a programme commonly
-- runs several rounds, each with its own course start and its own last date to
-- apply — "Round 1 starts September, apply by 15 January; Round 2 starts
-- February, apply by 15 September". With one pair of columns, staff could only
-- record one of them, so the other rounds were either lost or typed into the
-- programme name.
--
-- So the pair of columns becomes a child table, one row per round.
--
-- programs.start_date and programs.application_deadline are KEPT rather than
-- dropped, and are maintained by trigger as a mirror of the first round. Two
-- reasons:
--
--   * application_deadline is the catalogue fallback that applications use when
--     nobody has typed a deadline of their own (see src/lib/applicationDeadline.ts),
--     and it is read by the reminder cron, the processing calendar, the staff
--     queue and the intake-cycle summary. Keeping the column keeps all of those
--     working, and keeps the documented CSV import columns meaningful.
--   * it makes the change additive: nothing that reads a programme today has to
--     be updated in lockstep with this migration.
--
-- The mirror is derived, one-way, and must not be written to directly — the
-- rounds are the source of truth. The column comments say so.

create table if not exists public.program_intake_rounds (
  id uuid primary key default gen_random_uuid(),
  program_id uuid not null references public.programs (id) on delete cascade,
  -- Free text rather than an integer, because "Round 1" is the common case but
  -- universities also publish "Early", "Main", "Clearing", "Fall 2026 Round 2".
  label text not null,
  -- When the course begins for this round.
  start_date date,
  -- The last date to apply for this round.
  application_deadline date,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),

  constraint program_intake_rounds_label_not_blank check (btrim(label) <> ''),

  -- A round with neither date records nothing. Without this, an empty repeated
  -- row in the form would be saved as a meaningless round.
  constraint program_intake_rounds_has_a_date
    check (start_date is not null or application_deadline is not null)
);

-- Rounds are always fetched for one programme (or a set of programmes) in
-- display order.
create index if not exists program_intake_rounds_program_idx
  on public.program_intake_rounds (program_id, sort_order, created_at);

comment on table public.program_intake_rounds is
  'Intake rounds for a programme: per round, when the course starts and the last date to apply. Source of truth for programme dates; programs.start_date/application_deadline mirror the first round.';

comment on column public.programs.start_date is
  'DERIVED — mirror of the first intake round''s start_date, maintained by the program_intake_rounds_sync trigger. Do not write directly; insert a program_intake_rounds row instead.';
comment on column public.programs.application_deadline is
  'DERIVED — mirror of the first intake round''s application_deadline, maintained by the program_intake_rounds_sync trigger. Still the catalogue fallback an application uses when it has no deadline of its own. Do not write directly; insert a program_intake_rounds row instead.';

-- ---------------------------------------------------------------- the mirror

-- SECURITY DEFINER because of the RLS on programs: UPDATE there is super_admin
-- only (0039), while inserting a round is open to any active staff member.
-- Without it, a counselor adding a round would have the round accepted and the
-- mirror silently refused, leaving the two out of step.
create or replace function public.sync_program_first_round() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  pid uuid := coalesce(new.program_id, old.program_id);
begin
  -- Both values come from scalar subqueries so that "no rounds left" clears the
  -- mirror rather than leaving the last deleted round's dates behind.
  update programs p
  set start_date = (
        select r.start_date from program_intake_rounds r
        where r.program_id = pid order by r.sort_order, r.created_at limit 1
      ),
      application_deadline = (
        select r.application_deadline from program_intake_rounds r
        where r.program_id = pid order by r.sort_order, r.created_at limit 1
      )
  where p.id = pid;

  return null;
end $$;

drop trigger if exists program_intake_rounds_sync on public.program_intake_rounds;
create trigger program_intake_rounds_sync
after insert or update or delete on public.program_intake_rounds
for each row execute function public.sync_program_first_round();

-- --------------------------------------------------------------------- backfill

-- Every programme that already carries a date keeps it, as its first round.
-- Guarded against re-running: the migration is idempotent everywhere else and
-- this is the one statement that would otherwise duplicate.
insert into public.program_intake_rounds (program_id, label, start_date, application_deadline, sort_order)
select p.id, 'Round 1', p.start_date, p.application_deadline, 1
from public.programs p
where (p.start_date is not null or p.application_deadline is not null)
  and not exists (select 1 from public.program_intake_rounds r where r.program_id = p.id);

-- -------------------------------------------------------------------------- RLS

-- Mirrors the policy set on programs exactly. A reader who can see a programme
-- must be able to see its rounds, or the nested select that fetches them comes
-- back empty and the dates simply vanish for that role — students and partners
-- both read the catalogue, not just staff.
alter table public.program_intake_rounds enable row level security;

create policy "program_intake_rounds_select" on public.program_intake_rounds for select
  using (
    is_active_staff()
    or is_registered_student()
    or exists (
      select 1 from public.programs p
      where p.id = program_id and p.university_id = partner_university_id()
    )
  );

-- Insert follows programs_insert: any active staff member, plus a partner on
-- their own university's programmes.
create policy "program_intake_rounds_insert" on public.program_intake_rounds for insert
  with check (
    is_active_staff()
    or exists (
      select 1 from public.programs p
      where p.id = program_id and p.university_id = partner_university_id()
    )
  );

-- Update and delete follow programs_update/programs_delete: super_admin only
-- among staff, plus the owning partner.
create policy "program_intake_rounds_update" on public.program_intake_rounds for update
  using (
    has_role(array['super_admin']::staff_role[])
    or exists (
      select 1 from public.programs p
      where p.id = program_id and p.university_id = partner_university_id()
    )
  )
  with check (
    has_role(array['super_admin']::staff_role[])
    or exists (
      select 1 from public.programs p
      where p.id = program_id and p.university_id = partner_university_id()
    )
  );

create policy "program_intake_rounds_delete" on public.program_intake_rounds for delete
  using (
    has_role(array['super_admin']::staff_role[])
    or exists (
      select 1 from public.programs p
      where p.id = program_id and p.university_id = partner_university_id()
    )
  );
