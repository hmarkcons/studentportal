-- The document requirement index, per intake.
--
-- student_documents_one_per_template is what makes requirement seeding safe to
-- run on every page load, but it is keyed on (student, template) alone. With
-- intake cycles that quietly forbids the two cases the office asked for:
--
--   * a requirement marked to be renewed each intake (a bank statement, a
--     police certificate) cannot be asked for again in the new intake, because
--     last year's row already occupies the key
--   * the visa and scholarship documents, which deliberately do not carry
--     over, cannot be raised fresh either
--
-- Per intake, it means the same thing it meant before: one row per requirement
-- per attempt. A requirement collected once and never renewed still has
-- exactly one row, in the intake it was collected in, and the new intake
-- inherits it rather than copying it.

update public.student_documents d
set cycle_id = c.id
from public.student_cycles c
where c.student_id = d.student_id and c.sequence = 1 and d.cycle_id is null;

drop index if exists student_documents_one_per_template;

create unique index if not exists student_documents_one_per_template_per_cycle
  on public.student_documents (student_id, cycle_id, template_id)
  where application_id is null and template_id is not null;
