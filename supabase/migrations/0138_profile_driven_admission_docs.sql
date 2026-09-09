-- Admission documents now come from the student's own profile, so the fixed
-- academic and language items in the shared checklist are superseded.
--
-- Per the brief, the Admission section asks for the qualifications and test
-- scores entered in the profile. A student with one bachelors and an IELTS is
-- asked for that bachelors' certificate and transcript and that IELTS
-- scorecard — not for a fixed "Associate degree transcript (if applicable)",
-- a "Current university transcript (if applicable)" and a generic "Language
-- certificate" listing seven tests they may not have taken.
--
-- Leaving these 13 templates in place would ask for every academic document
-- twice: once from the template and once from the profile. The genuinely
-- non-academic items — passport, CNIC, photograph, CV, statement of purpose,
-- recommendation letters, experience letters, grading system, syllabus — are
-- untouched, since nothing in a profile implies them.
--
-- Existing student rows are handled the same way ensureStudentDocumentRequirements
-- now handles a retired derived row: one carrying an uploaded file is kept, with
-- the template's name copied onto it so it still reads correctly after the
-- template is gone; an empty placeholder is removed. On the live data that is
-- 1 row kept and 301 placeholders cleared.
--
-- Nothing here is one-way: the builder can re-add any of these to the
-- All-destinations list, or to one country, in a few clicks.

-- A test recorded as "Other" needs the test's own name, or the document
-- requirement it generates would read "Other — scorecard".
alter table public.student_test_scores
  add column if not exists custom_test_name text;

do $$
declare
  superseded_ids uuid[];
begin
  select array_agg(id) into superseded_ids
  from public.document_templates
  where destination_id is null
    and category = 'admission'
    and name in (
      'Academic transcripts',
      'Degree certificate',
      'Secondary school / O-Level transcript',
      'Secondary school / O-Level certificate',
      'High school / DAE / A-Level transcript',
      'High school / DAE / A-Level certificate',
      'Associate degree transcript (if applicable)',
      'Associate degree certificate (if applicable)',
      'Current university transcript (if applicable)',
      'Language proficiency certificate',
      'Language certificate (IELTS / PTE / TOEFL / Duolingo / LangCert / IB — MOI accepted for Masters only)',
      'Bachelor''s degree',
      'Bachelor''s transcript'
    );

  if superseded_ids is null then
    raise notice 'No superseded admission templates found — nothing to do.';
    return;
  end if;

  -- Keep anything the student actually uploaded, and carry the name across so
  -- the row does not become anonymous once its template is deleted.
  update public.student_documents d
  set custom_name = coalesce(d.custom_name, t.name),
      template_id = null
  from public.document_templates t
  where t.id = d.template_id
    and d.template_id = any (superseded_ids)
    and d.file_path is not null;

  -- Empty placeholders for a document the profile will now ask for anyway.
  delete from public.student_documents
  where template_id = any (superseded_ids)
    and file_path is null;

  -- student_documents.template_id is ON DELETE NO ACTION, so this would fail
  -- loudly rather than silently orphan anything if a referencing row remained.
  delete from public.document_templates where id = any (superseded_ids);

  raise notice 'Retired % superseded admission templates.', array_length(superseded_ids, 1);
end $$;
