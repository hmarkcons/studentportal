-- One document is one requirement, however many of a student's countries ask
-- for it. This clears the rows where that was not the case.
--
-- A student pursuing two destinations was asked for the same document once per
-- destination, because each destination's checklist carries its own copy:
-- Germany and Italy both ask for the HEC attestation, the IBCC attestation and
-- the O/A-Level equivalency, and Italy and Sweden both ask for travel
-- insurance. The student hands in one piece of paper each time.
--
-- ensureStudentDocumentRequirements now suppresses this at source (see
-- templatesToSeed); this removes the seven surplus rows already on file.
--
-- Which copy survives, in order of preference:
--   1. one that has a file uploaded against it — never delete evidence
--   2. one backed by the shared All-destinations template, since that stays
--      applicable even if the student later drops a destination
--   3. the lowest sort_order, then the oldest row, so the choice is stable
--
-- Only rows with no file are ever deleted. Where two copies both carry an
-- upload, both are kept and the notice says so rather than picking one — that
-- is two real documents from the student's point of view, whatever the
-- checklist thinks.
--
-- Matching is on section AND name, deliberately not name alone: the Visa
-- section has its own "Photo" alongside Admission's "Passport-size
-- photographs", and a photo for the consulate is not the photo for the
-- university.

do $$
declare
  both_uploaded integer;
  removed integer;
begin
  with named as (
    select d.id, d.student_id, d.category, d.file_path,
           lower(btrim(t.name)) as name_key
    from public.student_documents d
    join public.document_templates t on t.id = d.template_id
    where d.application_id is null
  )
  select count(*) into both_uploaded
  from (
    select student_id, category, name_key
    from named
    group by 1, 2, 3
    having count(*) filter (where file_path is not null) > 1
  ) x;

  if both_uploaded > 0 then
    raise notice 'Leaving % duplicate group(s) alone: more than one copy carries an upload.', both_uploaded;
  end if;

  with named as (
    select d.id, d.student_id, d.category, d.file_path, d.created_at,
           lower(btrim(t.name)) as name_key,
           t.destination_id, t.sort_order
    from public.student_documents d
    join public.document_templates t on t.id = d.template_id
    where d.application_id is null
  ),
  ranked as (
    select id, file_path,
           row_number() over (
             partition by student_id, category, name_key
             order by
               (file_path is null),                 -- an upload wins
               (destination_id is not null),        -- then the shared template
               sort_order,
               created_at,
               id
           ) as rank,
           count(*) filter (where file_path is not null)
             over (partition by student_id, category, name_key) as uploads_in_group
    from named
  )
  delete from public.student_documents
  where id in (
    select id from ranked
    where rank > 1
      and file_path is null
      and uploads_in_group <= 1   -- groups with two uploads are left untouched
  );

  get diagnostics removed = row_count;
  raise notice 'Removed % duplicated requirement row(s).', removed;
end $$;
