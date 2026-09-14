-- Intake cycles: a student going round the process a second time.
--
-- A visa refusal, a student who went quiet, a student who withdrew and then
-- came back — in every case the office starts the process again for a later
-- intake, and everything from the first attempt has to stay exactly where it
-- is. Not archived, not deleted: a student who re-applies next year still
-- wants last year's degree attestation, and staff still need to see that
-- Torino rejected them in 2026 before applying there again in 2027.
--
-- So nothing is copied or moved. A cycle is a label, applications and
-- documents carry the cycle they were raised in, and the screens grow one tab
-- per cycle. A student who only goes round once has exactly one cycle and sees
-- no tabs at all, which is almost every student.

create table if not exists public.student_cycles (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.leads (id) on delete cascade,
  -- 1 is the original attempt. Numbered rather than dated because "their
  -- second attempt" is how the office talks about it.
  sequence integer not null check (sequence >= 1),
  intake text,
  is_current boolean not null default true,
  -- Why they are going round again. Null on the first cycle: nobody needed a
  -- reason to start.
  reason text check (reason in ('visa_refused', 'ghost', 'withdrawn', 'other')),
  -- Whether staff kept the same intake because there was still time, or moved
  -- the student to the next one.
  decision text check (decision in ('initial', 'resumed', 'deferred')),
  note text,
  started_at timestamptz not null default now(),
  created_by uuid references public.staff (id),
  created_at timestamptz not null default now(),
  unique (student_id, sequence)
);

-- Exactly one current cycle per student, enforced rather than trusted: two
-- current cycles would make "which intake is this document for" unanswerable.
create unique index if not exists student_cycles_one_current
  on public.student_cycles (student_id) where is_current;

create index if not exists student_cycles_student_idx
  on public.student_cycles (student_id, sequence);

-- Everything that belongs to one attempt rather than to the student.
alter table public.applications
  add column if not exists cycle_id uuid references public.student_cycles (id) on delete set null;
alter table public.student_documents
  add column if not exists cycle_id uuid references public.student_cycles (id) on delete set null;
alter table public.student_scholarships
  add column if not exists cycle_id uuid references public.student_cycles (id) on delete set null;

create index if not exists applications_cycle_idx on public.applications (cycle_id);
create index if not exists student_documents_cycle_idx on public.student_documents (cycle_id);

-- Which documents go stale between intakes. A degree certificate does not
-- expire; a bank statement, a police certificate and a medical do. Flagged per
-- requirement in Setup rather than guessed from the name here, because getting
-- it wrong in either direction costs a student real money.
alter table public.document_templates
  add column if not exists renew_each_intake boolean not null default false;

comment on column public.document_templates.renew_each_intake is
  'Ask for this again when a student starts a new intake, instead of carrying the approved copy over.';

-- --------------------------------------------------------------- backfill
-- Every student who has anything in the system gets cycle 1, so no existing
-- row is left with no cycle to belong to.
insert into public.student_cycles (student_id, sequence, intake, is_current, decision, started_at)
select l.id, 1, l.intake, true, 'initial', coalesce(l.registered_at, l.created_at, now())
from public.leads l
where (
    l.registered_at is not null
    or exists (select 1 from public.applications a where a.student_id = l.id)
    or exists (select 1 from public.student_documents d where d.student_id = l.id)
  )
  and not exists (select 1 from public.student_cycles c where c.student_id = l.id)
on conflict do nothing;

update public.applications a
set cycle_id = c.id
from public.student_cycles c
where c.student_id = a.student_id and c.sequence = 1 and a.cycle_id is null;

update public.student_documents d
set cycle_id = c.id
from public.student_cycles c
where c.student_id = d.student_id and c.sequence = 1 and d.cycle_id is null;

update public.student_scholarships s
set cycle_id = c.id
from public.student_cycles c
where c.student_id = s.student_id and c.sequence = 1 and s.cycle_id is null;

-- --------------------------------------------------------------- RLS
alter table public.student_cycles enable row level security;

-- A student can see their own intakes — the portal tabs are theirs too.
drop policy if exists student_cycles_select on public.student_cycles;
create policy student_cycles_select on public.student_cycles
  for select using (is_own_student(student_id) or staff_can_view_student(student_id));

-- Starting a student again is a staff decision. Which roles may do it is
-- enforced in the app through the students.restart_process permission, the way
-- every other permission in this codebase is; the policy keeps it to staff who
-- can see the student at all.
drop policy if exists student_cycles_write on public.student_cycles;
create policy student_cycles_write on public.student_cycles
  for all
  using (staff_can_view_student(student_id))
  with check (staff_can_view_student(student_id));

insert into public.permission_definitions (key, category, label, description, default_roles, sort_order)
values (
  'students.restart_process',
  'Students',
  'Start a student''s process again',
  'Begin a new intake for a student whose visa was refused, or who was marked ghosted or withdrawn. Their previous applications and documents are kept.',
  '{counselor,processing,management,super_admin}',
  (select coalesce(max(sort_order), 0) + 10 from public.permission_definitions)
)
on conflict (key) do update
  set category = excluded.category,
      label = excluded.label,
      description = excluded.description;
