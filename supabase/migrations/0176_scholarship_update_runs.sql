-- Checking each region's own site for a new call, without trusting the result.
--
-- The guides are HMARK's summary of documents published on twenty-one separate
-- regional websites, each of which republishes its call once a year on its own
-- schedule. Keeping them current by hand means somebody visiting all of them
-- and reading Italian, which is why the 2026/2027 set took a person a week and
-- why seven bodies still have no guide at all.
--
-- So: a queue. A run is asked for, a background job fetches the body's site,
-- reads the call and writes down what it thinks should change — and stops
-- there. Nothing it produces is written onto a body until a person says so.
--
-- That last part is deliberate and worth defending. These guides carry
-- deadlines and document lists that students act on, and a guide that somebody
-- corrected by hand is worth more than a fresh reading of a PDF. An automatic
-- overwrite would silently undo the correction, and nobody would find out
-- until a student missed a deadline. Applying is one click for all of it.

create table if not exists public.scholarship_body_update_runs (
  id uuid primary key default gen_random_uuid(),
  scholarship_body_id uuid not null references public.scholarship_bodies (id) on delete cascade,

  status text not null default 'queued',
  -- queued    → waiting for the job
  -- running   → the job has it
  -- proposed  → it found changes; a person has to accept them
  -- no_change → the call has not moved since the last look
  -- awaiting  → the region has not published this year's call yet
  -- failed    → could not read the site; error says why
  -- applied   → a person accepted the proposal
  -- dismissed → a person rejected it

  academic_year text,
  requested_by uuid references public.staff (id),
  requested_at timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz,

  -- What it read, and where. source_fingerprint is how "has anything actually
  -- changed?" is answered without re-reading the whole call every time.
  source_url text,
  source_fingerprint text,
  call_pdf_url text,

  -- The proposed new values, field by field, as {field: {from, to}}. Null
  -- until the job has something to say.
  proposal jsonb,
  -- Anything the job was unsure of, in its own words, so a reviewer knows
  -- where to look rather than having to check all of it.
  notes text,
  error text,

  reviewed_by uuid references public.staff (id),
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.scholarship_body_update_runs drop constraint if exists scholarship_body_update_runs_status_check;
alter table public.scholarship_body_update_runs
  add constraint scholarship_body_update_runs_status_check
  check (status in ('queued', 'running', 'proposed', 'no_change', 'awaiting', 'failed', 'applied', 'dismissed'));

comment on table public.scholarship_body_update_runs is
  'One attempt to refresh a scholarship body from its own website. Proposals are never applied on their own — a person accepts or rejects each run.';
comment on column public.scholarship_body_update_runs.source_fingerprint is
  'Hash of what was read. Equal to the last successful run means the call has not moved, so there is nothing to propose.';

create index if not exists scholarship_update_runs_body_idx
  on public.scholarship_body_update_runs (scholarship_body_id, requested_at desc);

-- The job claims work with this, so it has to be quick and it has to be the
-- oldest first — otherwise a queue that never drains starves its own tail.
create index if not exists scholarship_update_runs_queue_idx
  on public.scholarship_body_update_runs (status, requested_at)
  where status in ('queued', 'running');

-- Only one live request per body: clicking the button twice should not send
-- the same region two readers, and a proposal waiting for review should not be
-- replaced by a second one behind its back.
create unique index if not exists scholarship_update_runs_one_live
  on public.scholarship_body_update_runs (scholarship_body_id)
  where status in ('queued', 'running', 'proposed');

alter table public.scholarship_body_update_runs enable row level security;

-- Readable by any active staff member: the point of the queue is that the
-- office can see what is happening to the directory.
drop policy if exists scholarship_update_runs_select on public.scholarship_body_update_runs;
create policy scholarship_update_runs_select on public.scholarship_body_update_runs
  for select using (is_active_staff());

-- Asking for a run, and accepting or rejecting a proposal, is the same right
-- as editing the body itself.
drop policy if exists scholarship_update_runs_write on public.scholarship_body_update_runs;
create policy scholarship_update_runs_write on public.scholarship_body_update_runs
  for all
  using (has_role(array['processing', 'management', 'super_admin']::staff_role[]))
  with check (has_role(array['processing', 'management', 'super_admin']::staff_role[]));

-- ------------------------------------------------------- when it last looked
alter table public.scholarship_bodies
  add column if not exists last_checked_at timestamptz,
  add column if not exists last_check_result text;

comment on column public.scholarship_bodies.last_checked_at is
  'When the region''s own site was last read. Distinct from guide_updated_at, which is when a person last changed the guide.';
