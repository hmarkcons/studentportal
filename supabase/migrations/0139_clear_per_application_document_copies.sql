-- Clears the backlog left by addApplication seeding the whole checklist onto
-- every application.
--
-- Every new application copied the destination's entire document checklist,
-- on top of the student-level copy ensureStudentDocumentRequirements already
-- maintains. The result was the same passport and the same transcript asked
-- for once per university, each labelled with that university's name, in the
-- application checklist and again in the Documents tab. The seeding is gone;
-- this removes what it already created.
--
-- Only template-backed rows with nothing uploaded against them: a row someone
-- actually attached a file to is kept whatever its provenance, and the
-- manually added extras (template_id null) are the ones that are supposed to
-- be there — those are what the application checklist is for now.
--
-- On the live data: 297 empty copies removed, 0 rows with files touched, 2
-- manual extras left alone.

delete from public.student_documents
where application_id is not null
  and template_id is not null
  and file_path is null;
