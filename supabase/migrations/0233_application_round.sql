-- Record which intake round an application is aimed at.
--
-- 0232 gave a programme several rounds, each with its own course start and its
-- own last date to apply. An application had no way to say which of them it was
-- for, so everything downstream fell back to the first round: the reminder
-- cron, the processing calendar and the staff queue all read
-- programs.application_deadline, which is a mirror of round one. A student
-- going for Round 2 was chased on Round 1's date, and the round they were
-- actually in existed nowhere.
--
-- The obvious shape is applications.round_id -> program_intake_rounds(id), but
-- a plain single-column FK permits the one mistake that actually matters:
-- pointing an application at a round belonging to a DIFFERENT programme. That
-- is reachable by editing the programme on a page whose round list is stale,
-- and it produces an application whose deadline comes from a course it is not
-- for — wrong in a way nothing on screen would reveal.
--
-- So the reference is composite, (program_id, round_id) -> (program_id, id).
-- With the default MATCH SIMPLE, a NULL in either column leaves it unenforced,
-- which is what allows "programme chosen, no round yet" — the common case.
-- Both non-null and the pair must genuinely exist together.
--
-- The CHECK closes the remaining hole MATCH SIMPLE leaves open: a round with no
-- programme at all, which would otherwise pass unenforced.

-- The composite FK needs a unique key to point at. (program_id, id) is already
-- unique because id alone is, so this only supplies the index.
alter table public.program_intake_rounds
  drop constraint if exists program_intake_rounds_program_id_id_key;
alter table public.program_intake_rounds
  add constraint program_intake_rounds_program_id_id_key unique (program_id, id);

alter table public.applications
  add column if not exists round_id uuid;

comment on column public.applications.round_id is
  'Which of the programme''s intake rounds this application is for. Constrained to a round of applications.program_id. Null means no round chosen yet; the deadline then falls back to the programme''s mirrored first-round date.';

alter table public.applications
  drop constraint if exists applications_round_fkey;
alter table public.applications
  add constraint applications_round_fkey
  foreign key (program_id, round_id)
  references public.program_intake_rounds (program_id, id)
  -- Only round_id is cleared. A plain ON DELETE SET NULL would null
  -- program_id too, so removing a round from a programme would quietly
  -- detach every application from the programme as well. Postgres 15+
  -- syntax; this database is on 17.6.
  on delete set null (round_id);

alter table public.applications
  drop constraint if exists applications_round_needs_program;
alter table public.applications
  add constraint applications_round_needs_program
  check (round_id is null or program_id is not null);

create index if not exists applications_round_idx on public.applications (round_id);

-- Nothing to backfill: no application has ever named a round, and guessing one
-- from the intake free-text would be inventing data. Every existing row keeps
-- round_id null and the first-round fallback it already had.
