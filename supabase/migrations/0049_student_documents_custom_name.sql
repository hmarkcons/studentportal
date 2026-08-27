-- Real bug found while testing document upload: `student_documents` has no
-- column to hold a custom document name. `addDocumentRequirement` collects
-- a required "name" field from the Add-requirement form, validates it's
-- non-empty, then never inserts it anywhere — every ad-hoc requirement a
-- staff member adds displays only as its generic category ("admission",
-- "visa", ...) with no way to distinguish multiple documents of the same
-- category (confirmed live: 5 requirements all just showed as "admission").
alter table student_documents add column custom_name text;
