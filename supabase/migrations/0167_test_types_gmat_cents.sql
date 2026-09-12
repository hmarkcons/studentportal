-- GMAT and CEnT-S were added to the dropdown and not to the database.
--
-- "new row for relation student_test_scores violates check constraint
-- student_test_scores_test_type_check" — the picker offers twelve tests,
-- student_test_scores_test_type_check names ten. Choosing either of the two
-- that were added later fails at the moment of saving, after the score and
-- the date have been typed.
--
-- This is the fifth hand-maintained list in this schema to go stale the same
-- way, and unlike the others it has no table to defer to: these are named
-- standardised tests, added by a developer, not configured by staff. So the
-- list stays — with a unit test pinning src/lib/testScores.ts against it, so
-- the next addition fails in the test suite with a message asking for a
-- migration, rather than in front of whoever is typing a score.

alter table student_test_scores drop constraint if exists student_test_scores_test_type_check;
alter table student_test_scores
  add constraint student_test_scores_test_type_check
  check (test_type in (
    'ielts',
    'toefl',
    'pte',
    'duolingo',
    'langcert',
    'ib',
    'moi',
    'gre',
    'gmat',
    'sat',
    'cent_s',
    'other'
  ));

-- "Other" is only meaningful with the test's own name against it, and the
-- requirement it generates reads "Other — scorecard" without one.
alter table student_test_scores drop constraint if exists student_test_scores_other_needs_name;
alter table student_test_scores
  add constraint student_test_scores_other_needs_name
  check (test_type <> 'other' or nullif(btrim(coalesce(custom_test_name, '')), '') is not null);
