-- Applications carry an order the office chooses, not the one they were typed in.
--
-- The list was ordered by created_at, so the first university anyone happened
-- to enter sat at the top forever. That is the opposite of what the list is
-- for: staff read it top-down to see which university and programme this
-- student is being pushed for first, and priority changes as offers come in
-- and deadlines pass. Reordering meant deleting an application and making a
-- new one, which takes its tasks, documents, interviews and stage history
-- with it.

alter table public.applications
  add column if not exists sort_order integer;

comment on column public.applications.sort_order is
  'Priority within the student''s applications for one destination — lower is higher priority. Null sorts last, then by created_at.';

-- Existing rows keep the order they are shown in today: per student and per
-- destination, oldest first. Numbered in tens so a later single move can be
-- written without renumbering its neighbours.
with ranked as (
  select
    a.id,
    row_number() over (
      partition by a.student_id, u.destination_id
      order by a.created_at, a.id
    ) * 10 as position
  from public.applications a
  left join public.universities u on u.id = a.university_id
)
update public.applications a
set sort_order = ranked.position
from ranked
where ranked.id = a.id
  and a.sort_order is null;

-- The list is always read for one student, usually narrowed to one country's
-- tab, and always in this order.
create index if not exists applications_student_sort_idx
  on public.applications (student_id, sort_order, created_at);
