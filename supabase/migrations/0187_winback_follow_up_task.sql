-- A win-back task for a student who withdrew, alongside the chase for one who
-- went quiet.
--
-- 0186 opened a chase task when a student was marked ghosted. Withdrawing is
-- the other way a student stops, and it is a different errand: they decided,
-- rather than drifted, so the follow-up is later and gentler. Both are
-- personal_tasks with a source tag; only the wording, the timing and the
-- priority differ, and those live in src/lib/followUpTasks.ts.
--
-- The only thing needing to change here is the uniqueness rule. 0186 allowed
-- one open task per student for source = 'ghost_chase' specifically. It now
-- has to hold for each kind independently: a student who goes quiet, is
-- chased, then formally withdraws should end up with the chase closed and one
-- win-back open — never two of the same kind, and never a win-back blocked
-- because a chase once existed.

drop index if exists personal_tasks_one_open_chase;

create unique index if not exists personal_tasks_one_open_follow_up
  on public.personal_tasks (student_id, source)
  where source is not null and status = 'pending';

comment on column public.personal_tasks.source is
  'Null for anything a person created. ''ghost_chase'' for a student who went quiet, ''winback'' for one who withdrew.';
