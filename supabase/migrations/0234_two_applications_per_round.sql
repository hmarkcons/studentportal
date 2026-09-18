-- Let a student apply for the same programme in two different intake rounds.
--
-- applications_one_per_program_per_cycle was unique on
-- (student_id, cycle_id, university_id, program_id), which predates rounds
-- existing. Since 0233 an application says which round it is for, and the two
-- rounds of one programme are two genuinely different applications with
-- different closing dates — a student who misses Round 1 and goes again at
-- Round 2 was forced to overwrite the first attempt rather than record both.
--
-- So round_id joins the key. The subtlety is NULL handling, and getting it
-- wrong either way loses something:
--
--   * with the DEFAULT "nulls distinct", every NULL round_id is unique, so the
--     duplicate protection would evaporate for exactly the common case — most
--     programmes have no rounds at all, so most applications carry round_id
--     NULL, and a student could accumulate unlimited identical rows.
--   * with "nulls not distinct", two NULL round_ids compare equal, so "same
--     programme, no round chosen, twice" is still refused while "same
--     programme, two different rounds" is allowed. Which is the rule wanted.
--
-- NULLS NOT DISTINCT is Postgres 15+; this database is on 17.6.
--
-- It applies to the whole key, not just round_id, so two other cases tighten as
-- a side effect. Both were holes rather than features:
--
--   * program_id NULL — two applications at one university with no programme
--     chosen yet are indistinguishable duplicates, and were previously both
--     allowed.
--   * cycle_id NULL — rows predating intake cycles could duplicate freely.
--
-- Neither can break existing data: applications is empty as of this migration
-- (the student data was cleared deliberately), so there is nothing for the
-- stricter index to reject on creation.

drop index if exists applications_one_per_program_per_cycle;

create unique index applications_one_per_program_round_per_cycle
  on public.applications (student_id, cycle_id, university_id, program_id, round_id)
  nulls not distinct;

comment on index public.applications_one_per_program_round_per_cycle is
  'One application per (student, intake cycle, university, programme, round). NULLS NOT DISTINCT so that "same programme, no round chosen" is still caught as a duplicate, while the same programme in two different rounds is allowed.';
