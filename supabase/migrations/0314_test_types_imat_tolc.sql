-- IMAT and TOLC as test types, beside CEnT-S and SAT.
--
-- Italy's documentation tracker ticks the admission tests a student sits —
-- IMAT, TOLC, CEnT-S, SAT — and each ticked test now records its date and
-- score in the student's own Test scores, the one place a score lives. Two of
-- the four could not be stored there: the type list, pinned by
-- student_test_scores_test_type_check (0167), had no IMAT or TOLC. They are
-- added here, and src/lib/testScores.ts with them (scripts/test-scores-test.mjs
-- holds the two together).

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
    'imat',
    'tolc',
    'other'
  ));
