-- HMARK CRM rebuild — step 34: add academic_requirement to programs.
-- The deep-research program-seeding pass captures both a language
-- requirement (already had a column) and a general academic admission
-- requirement per program (e.g. "Bachelor's degree with 3.0 GPA") — there
-- was no column for the latter.
-- Run after 0037_reclassify_private_destinations.sql.

alter table programs add column academic_requirement text;
