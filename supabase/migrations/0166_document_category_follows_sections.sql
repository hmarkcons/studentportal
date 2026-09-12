-- Adding a requirement to a section staff created themselves failed with
-- "new row for relation document_templates violates check constraint
-- document_templates_category_check".
--
-- document_templates.category carried a CHECK naming eleven categories,
-- written when the sections were fixed. 0137 made them configurable: staff
-- create a section in Create Doc Checklist, it lands in document_sections, and
-- the requirement they then add to it is a document_templates row whose
-- category is that new key — which the CHECK has never heard of. So a new
-- section could be created and then not used, which is the whole point of
-- creating one. There is a staff-made "test_section" on file right now that
-- nothing can be added to.
--
-- This is the fourth hand-maintained list in this schema to go stale the same
-- way (staff_select in 0074 and again in 0105, the partner update denylist in
-- 0161). The fix is the same in spirit: stop maintaining a copy. The set of
-- sections has a home — document_sections, whose key is its primary key — so
-- the column references it instead of restating it. A section added tomorrow
-- is valid the moment it exists, and a category that is not a section is still
-- refused, now by referential integrity rather than by a list.
--
-- Checked before writing: every category currently on document_templates and
-- on student_documents already exists in document_sections, so nothing is
-- orphaned by this.

alter table document_templates drop constraint if exists document_templates_category_check;

alter table document_templates drop constraint if exists document_templates_category_fkey;
alter table document_templates
  add constraint document_templates_category_fkey
  foreign key (category) references document_sections (key)
  -- A section renamed keeps its requirements; a section cannot be deleted
  -- while requirements still sit in it, which is the honest answer — those
  -- requirements would otherwise be left pointing at nothing and would vanish
  -- from every checklist without a word.
  on update cascade
  on delete restrict;

-- student_documents.category had no constraint at all, so a student row could
-- name a section that does not exist — and one landing in a section nothing
-- renders is a document nobody is ever asked for. It is not made a foreign key
-- here: those rows are historical records, and a section deleted years later
-- must not be blocked by, or take with it, a document a student actually sent.
-- The checklist already renders an unknown category under "Other" (0137), so
-- the failure mode is visible rather than silent.
comment on column student_documents.category is
  'The document_sections key this requirement belongs to. Deliberately not a foreign key: these are historical records and an unknown section falls through to "Other" rather than blocking.';
