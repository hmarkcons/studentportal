-- A task for the counsellor when a student goes quiet.
--
-- Marking a student ghosted was a dead end: the status changed, the student
-- dropped out of everyone's attention, and nothing prompted anybody to try
-- again. The restart workflow exists for when they come back, but nothing was
-- bringing them back.
--
-- So marking a student ghosted now opens a task on their counsellor's own list
-- and calendar, and it closes itself when the student is registered again.
--
-- personal_tasks is the right home. application_tasks hang off an application,
-- and a student who went quiet before any application was raised — which is
-- the commonest way of going quiet — has none to hang a task on. The one thing
-- personal_tasks lacked was a way to say which student a task is about, so a
-- counsellor reading "chase Ahmed" on Tuesday can get to him in one click.

alter table public.personal_tasks
  add column if not exists student_id uuid references public.leads (id) on delete cascade,
  -- Set only on tasks the system opened, so they can be found again and closed
  -- without touching anything a person wrote for themselves.
  add column if not exists source text;

comment on column public.personal_tasks.student_id is
  'The student this task is about, when it is about one. Null for an ordinary personal reminder.';
comment on column public.personal_tasks.source is
  'Null for anything a person created. ''ghost_chase'' for a task opened because a student was marked ghosted.';

create index if not exists personal_tasks_student_idx
  on public.personal_tasks (student_id) where student_id is not null;

-- One open chase task per student at a time. Marking someone ghosted twice, or
-- two people doing it at once, must not leave the counsellor with a column of
-- identical rows to clear.
create unique index if not exists personal_tasks_one_open_chase
  on public.personal_tasks (student_id, source)
  where source = 'ghost_chase' and status = 'pending';
