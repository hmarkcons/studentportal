-- HMARK CRM rebuild — step 27: add city/region to universities, matching
-- the doc's own field list for the "All Italian Universities"-style course
-- directory ("University, City, Region, Faculty, Program Level,
-- Departments in English"). Needed for the new CSV import feature and for
-- seeding the new destination countries with real city data.
-- Run after 0030_seed_finland_universities.sql.

alter table universities
  add column city text,
  add column region text;
