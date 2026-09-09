-- Backfills the shared Admission requirements that registered students are
-- missing, so nobody is left short of a row.
--
-- 0142 removed the vague "Letters of Recommendation" row from masters
-- students because masters has two numbered rows instead. But only 10 of the
-- 15 masters students actually had those numbered rows: the other five were
-- registered before that batch was added and had not had their Documents tab
-- opened since, which is what triggers seeding. So those five briefly had no
-- recommendation-letter requirement at all, where before they had one.
--
-- ensureStudentDocumentRequirements would have repaired that on the next page
-- load, but a gap that heals only when somebody happens to look is not a fixed
-- gap. This does the same work now, for every shared Admission item rather
-- than just the letters — the four students who predate the second wave were
-- missing CNIC and the rest for the same reason.
--
-- Idempotent: inserts only what is absent, at status 'missing', and matches
-- the level filter the application uses. Nothing already on file is touched.

insert into public.student_documents (student_id, application_id, template_id, category, status)
select l.id, null, t.id, t.category, 'missing'
from public.leads l
join public.document_templates t
  on t.destination_id is null
 and t.category = 'admission'
 and (t.level = 'all' or t.level = l.level_applying_for)
where l.registration_status = 'registered'
  and not exists (
    select 1 from public.student_documents d
    where d.student_id = l.id
      and d.template_id = t.id
      and d.application_id is null
  );
