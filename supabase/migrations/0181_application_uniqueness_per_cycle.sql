-- Two constraints written when a student only ever went round once.
--
-- Both of them silently forbid the thing intake cycles exist for:
--
--   unique (student_id, university_id, program_id)
--     A student refused a visa in 2027 cannot re-apply to the same programme
--     for 2028 — the most ordinary case there is. The insert fails with a
--     duplicate-key error that names a constraint, not a reason.
--
--   applications_one_finalized_per_student
--     Last year's finalised university permanently blocks finalising this
--     year's, so the new intake can never reach pre-enrolment or a visa.
--
-- Both become per cycle. Within one intake they mean exactly what they meant
-- before: one application per programme, one finalised university at a time.

-- Applications with no cycle (there should be none after 0180, but a row
-- inserted between the two migrations would have one) are treated as the
-- student's first attempt, so the index below stays total.
update public.applications a
set cycle_id = c.id
from public.student_cycles c
where c.student_id = a.student_id and c.sequence = 1 and a.cycle_id is null;

alter table public.applications
  drop constraint if exists applications_student_id_university_id_program_id_key;

-- A partial unique index rather than a constraint, because program_id is
-- nullable: in Postgres two rows with a null program_id do not collide, which
-- is how the old constraint behaved too — an application with no programme
-- chosen could always be added more than once, and that has not changed.
create unique index if not exists applications_one_per_program_per_cycle
  on public.applications (student_id, cycle_id, university_id, program_id);

drop index if exists applications_one_finalized_per_student;

create unique index if not exists applications_one_finalized_per_cycle
  on public.applications (student_id, cycle_id)
  where is_finalized;
