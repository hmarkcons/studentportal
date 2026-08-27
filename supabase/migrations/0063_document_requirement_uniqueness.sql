-- The static document_templates checklist (Passport copy, transcripts, etc.)
-- gets auto-seeded into student_documents as student-level rows
-- (application_id null) the first time a student's page is viewed, so staff
-- stop having to manually re-type the same ~10 standard documents on every
-- single university application. This unique index makes that seeding
-- idempotent under concurrent page loads (upsert with onConflict instead of
-- a plain insert, which could otherwise double-insert the same template).

create unique index if not exists student_documents_one_per_template
  on student_documents (student_id, template_id)
  where application_id is null and template_id is not null;
