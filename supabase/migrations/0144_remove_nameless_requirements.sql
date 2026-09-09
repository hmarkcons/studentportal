-- Clears requirements that have no name.
--
-- Eight rows across two students carry no template, no custom_name and no
-- derived_key, so the checklist has nothing to call them and falls back to
-- printing the bare section name or the word "Document". They ask the student
-- for something without saying what.
--
-- All eight predate the current code: addDocumentRequirement has always
-- required a name, so nothing in the app can create one now. None has a file
-- uploaded against it, so there is nothing to preserve.

delete from public.student_documents
where custom_name is null
  and template_id is null
  and derived_key is null
  and file_path is null;
