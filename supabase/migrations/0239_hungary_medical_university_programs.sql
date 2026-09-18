-- English-taught programmes for Hungary's three remaining medical universities.
--
-- Pécs already had 16. Semmelweis, Debrecen and Szeged had none, which meant
-- the four universities that make Hungary worth selling were one-quarter
-- usable: a counselor could not file General Medicine at Semmelweis, the
-- top-ranked medical school in Central and Eastern Europe.
--
-- Every row below is taken from the university's OWN English-programme
-- listing, not from an aggregator:
--
--   Semmelweis  semmelweis.hu/english/programs-to-study-at-semmelweis-university/
--   Debrecen    edu.unideb.hu/p/bachelor-programs, /p/master-programs,
--               /p/medical-degree-programs
--   Szeged      u-szeged.hu/english/bachelor-programmes, /english/master-programmes
--
-- Only entirely English-taught degree programmes, as asked. Deliberately
-- excluded:
--
--   * foundation / preparatory years (Debrecen's Foundation Programs, Szeged's
--     8-month Foundation Year) — not degrees
--   * Debrecen's two "Postgraduate Diploma" entries (Lean Engineer, Artificial
--     Intelligence) — not degrees either, and neither level in this table fits
--   * doctoral programmes — the level column takes 'phd', but these listings
--     do not enumerate the English-taught PhD programmes reliably enough
--
-- LEVEL. One-tier Medicine, Dentistry and Pharmacy are recorded as
-- 'bachelors', matching how Pécs's existing rows already record them. They are
-- entered from school rather than from a first degree, so 'bachelors' is what
-- the pipeline should treat them as, even though Szeged's own site groups them
-- under master's.
--
-- WHAT IS DELIBERATELY LEFT NULL. page_link is not populated. The listings
-- give programme names, and a per-programme URL would have to be guessed —
-- a broken or wrong link on a student's application is worse than none, and
-- Pécs's rows have real links precisely because each was opened individually.
-- duration is set only where the university publishes it (the medical
-- programmes); Hungarian BSc degrees run 6 or 7 semesters depending on the
-- programme and asserting one for all of them would be invention.
--
-- core_field follows each university's own grouping on those pages, so the
-- taxonomy is theirs rather than mine.

insert into public.programs (university_id, level, name, core_field, duration)
select u.id, v.level, v.name, v.core_field, v.duration
from (
  values
    -- ============================================ Semmelweis University (16)
    ('Semmelweis University', 'bachelors', 'General Medicine', 'Medicine (Medical & Health Sciences)', '6 years (12 semesters)'),
    ('Semmelweis University', 'bachelors', 'Dentistry', 'Dentistry (Medical & Health Sciences)', '5 years (10 semesters)'),
    ('Semmelweis University', 'bachelors', 'Pharmaceutical Sciences', 'Pharmacy (Medical & Health Sciences)', '5 years (10 semesters)'),
    ('Semmelweis University', 'bachelors', 'Physiotherapy', 'Physiotherapy (Medical & Health Sciences)', '4 years (8 semesters)'),
    ('Semmelweis University', 'bachelors', 'Nursing', 'Nursing (Medical & Health Sciences)', '4 years (8 semesters)'),
    ('Semmelweis University', 'bachelors', 'Midwifery', 'Midwifery (Medical & Health Sciences)', '4 years (8 semesters)'),
    ('Semmelweis University', 'bachelors', 'Dietetics', 'Dietetics (Medical & Health Sciences)', '4 years (8 semesters)'),
    ('Semmelweis University', 'bachelors', 'Optometry', 'Optometry (Medical & Health Sciences)', null),
    ('Semmelweis University', 'bachelors', 'Public Health Supervisor', 'Public Health (Medical & Health Sciences)', null),
    ('Semmelweis University', 'bachelors', 'Conductive Education', 'Education', null),
    ('Semmelweis University', 'masters', 'Nursing (MSc)', 'Nursing (Medical & Health Sciences)', null),
    ('Semmelweis University', 'masters', 'Physiotherapy (MSc)', 'Physiotherapy (Medical & Health Sciences)', null),
    ('Semmelweis University', 'masters', 'Clinical Translational Medicine', 'Medicine (Medical & Health Sciences)', null),
    ('Semmelweis University', 'masters', 'Psychobiology (MSc)', 'Psychology', null),
    ('Semmelweis University', 'masters', 'Systemic Psychology (MSc)', 'Psychology', null),
    ('Semmelweis University', 'masters', 'Health Care Management with Health Tourism Specialisation', 'Health Management', null),

    -- ============================================= University of Debrecen (72)
    ('University of Debrecen', 'bachelors', 'Medicine', 'Medicine (Medical & Health Sciences)', '6 years (12 semesters)'),
    ('University of Debrecen', 'bachelors', 'Dentistry', 'Dentistry (Medical & Health Sciences)', '5 years (10 semesters)'),
    ('University of Debrecen', 'bachelors', 'Pharmacy', 'Pharmacy (Medical & Health Sciences)', '5 years (10 semesters)'),
    ('University of Debrecen', 'bachelors', 'Agricultural Engineering, BSc', 'Agriculture', null),
    ('University of Debrecen', 'bachelors', 'Business Administration and Management, BSc', 'Business and Management', null),
    ('University of Debrecen', 'bachelors', 'Commerce and Marketing, BSc', 'Business and Management', null),
    ('University of Debrecen', 'bachelors', 'Biochemical Engineering, BSc', 'Engineering', null),
    ('University of Debrecen', 'bachelors', 'Chemical Engineering, BSc', 'Engineering', null),
    ('University of Debrecen', 'bachelors', 'Civil Engineering, BSc', 'Engineering', null),
    ('University of Debrecen', 'bachelors', 'Electrical Engineering, BSc', 'Engineering', null),
    ('University of Debrecen', 'bachelors', 'Engineering Management, BSc', 'Engineering', null),
    ('University of Debrecen', 'bachelors', 'Environmental Engineering, BSc', 'Engineering', null),
    ('University of Debrecen', 'bachelors', 'Mechanical Engineering, BSc', 'Engineering', null),
    ('University of Debrecen', 'bachelors', 'Mechatronics Engineering, BSc', 'Engineering', null),
    ('University of Debrecen', 'bachelors', 'Vehicle Engineering, BSc', 'Engineering', null),
    ('University of Debrecen', 'bachelors', 'Nursing and Patient Care (Physiotherapy), BSc', 'Physiotherapy (Medical & Health Sciences)', null),
    ('University of Debrecen', 'bachelors', 'Nursing and Patient Care (Nurse), BSc', 'Nursing (Medical & Health Sciences)', null),
    ('University of Debrecen', 'bachelors', 'Health Care and Disease Prevention (Public Health), BSc', 'Public Health (Medical & Health Sciences)', null),
    ('University of Debrecen', 'bachelors', 'Communication and Media Studies, BA', 'Humanities', null),
    ('University of Debrecen', 'bachelors', 'English and American Studies, BA', 'Humanities', null),
    ('University of Debrecen', 'bachelors', 'Romance Philology and Cultures (French Studies), BA', 'Humanities', null),
    ('University of Debrecen', 'bachelors', 'Psychology, BA', 'Psychology', null),
    ('University of Debrecen', 'bachelors', 'Business Informatics, BSc', 'Information Technology', null),
    ('University of Debrecen', 'bachelors', 'Computer Science, BSc', 'Computer Science', null),
    ('University of Debrecen', 'bachelors', 'Computer Science Engineering, BSc', 'Computer Science', null),
    ('University of Debrecen', 'bachelors', 'Musical Creative Art and Musicology, BA', 'Music', null),
    ('University of Debrecen', 'bachelors', 'Classical Performing Arts (Music), BA', 'Music', null),
    ('University of Debrecen', 'bachelors', 'Contemporary Music, BA', 'Music', null),
    ('University of Debrecen', 'bachelors', 'Biology, BSc', 'Science', null),
    ('University of Debrecen', 'bachelors', 'Biotechnology, BSc', 'Science', null),
    ('University of Debrecen', 'bachelors', 'Chemistry, BSc', 'Science', null),
    ('University of Debrecen', 'bachelors', 'Earth Sciences, BSc', 'Science', null),
    ('University of Debrecen', 'bachelors', 'Mathematics, BSc', 'Science', null),
    ('University of Debrecen', 'bachelors', 'Physics, BSc', 'Science', null),
    ('University of Debrecen', 'masters', 'Animal Husbandry Engineering, MSc', 'Agriculture', null),
    ('University of Debrecen', 'masters', 'Agricultural Environmental Management Engineering, MSc', 'Agriculture', null),
    ('University of Debrecen', 'masters', 'Crop Production Engineering, MSc', 'Agriculture', null),
    ('University of Debrecen', 'masters', 'Food Safety and Quality Engineering, MSc', 'Agriculture', null),
    ('University of Debrecen', 'masters', 'Plant Protection, MSc', 'Agriculture', null),
    ('University of Debrecen', 'masters', 'International Economy and Business, MSc', 'Business and Management', null),
    ('University of Debrecen', 'masters', 'Chemical Engineering, MSc', 'Engineering', null),
    ('University of Debrecen', 'masters', 'Electrical Engineering, MSc', 'Engineering', null),
    ('University of Debrecen', 'masters', 'Engineering Management, MSc', 'Engineering', null),
    ('University of Debrecen', 'masters', 'Environmental Engineering, MSc', 'Engineering', null),
    ('University of Debrecen', 'masters', 'Mechatronical Engineering, MSc', 'Engineering', null),
    ('University of Debrecen', 'masters', 'Mechanical Engineering, MSc', 'Engineering', null),
    ('University of Debrecen', 'masters', 'Sports Engineering, MSc', 'Engineering', null),
    ('University of Debrecen', 'masters', 'Urban Systems Engineering, MSc', 'Engineering', null),
    ('University of Debrecen', 'masters', 'Vehicle Engineering, MSc', 'Engineering', null),
    ('University of Debrecen', 'masters', 'Pharmaceutical Research and Development Manager, MSc', 'Pharmacy (Medical & Health Sciences)', null),
    ('University of Debrecen', 'masters', 'Public Health, MSc', 'Public Health (Medical & Health Sciences)', null),
    ('University of Debrecen', 'masters', 'Social Work in Health Care, MSc', 'Social Sciences', null),
    ('University of Debrecen', 'masters', 'Social Work and Social Economics, MA', 'Social Sciences', null),
    ('University of Debrecen', 'masters', 'English Studies, MA', 'Humanities', null),
    ('University of Debrecen', 'masters', 'American Studies, MA', 'Humanities', null),
    ('University of Debrecen', 'masters', 'Instruction of English as a Foreign Language, MA', 'Education', null),
    ('University of Debrecen', 'masters', 'Business Informatics, MSc', 'Information Technology', null),
    ('University of Debrecen', 'masters', 'Computer Science, MSc', 'Computer Science', null),
    ('University of Debrecen', 'masters', 'Computer Science Engineering, MSc', 'Computer Science', null),
    ('University of Debrecen', 'masters', 'Data Science, MSc', 'Computer Science', null),
    ('University of Debrecen', 'masters', 'Artificial Intelligence, MSc', 'Computer Science', null),
    ('University of Debrecen', 'masters', 'European and International Business Law, LL.M.', 'Law', null),
    ('University of Debrecen', 'masters', 'Classical Musical Performance, MA', 'Music', null),
    ('University of Debrecen', 'masters', 'Applied Mathematics, MSc', 'Science', null),
    ('University of Debrecen', 'masters', 'Biology, MSc', 'Science', null),
    ('University of Debrecen', 'masters', 'Chemistry, MSc', 'Science', null),
    ('University of Debrecen', 'masters', 'Environmental Sciences, MSc', 'Science', null),
    ('University of Debrecen', 'masters', 'Geography, MSc', 'Science', null),
    ('University of Debrecen', 'masters', 'Geoinformatics, MSc', 'Science', null),
    ('University of Debrecen', 'masters', 'Hydrobiology - Water Quality Management, MSc', 'Science', null),
    ('University of Debrecen', 'masters', 'Molecular Biology, MSc', 'Science', null),
    ('University of Debrecen', 'masters', 'Physics, MSc', 'Science', null),

    -- =============================================== University of Szeged (40)
    ('University of Szeged', 'bachelors', 'General Medicine (MD)', 'Medicine (Medical & Health Sciences)', '6 years (12 semesters)'),
    ('University of Szeged', 'bachelors', 'Dental Medicine (DMD)', 'Dentistry (Medical & Health Sciences)', '5 years (10 semesters)'),
    ('University of Szeged', 'bachelors', 'Pharmacy', 'Pharmacy (Medical & Health Sciences)', '5 years (10 semesters)'),
    ('University of Szeged', 'bachelors', 'Agricultural Engineering (BSc)', 'Agriculture', null),
    ('University of Szeged', 'bachelors', 'Biochemical Engineer (BSc)', 'Engineering', null),
    ('University of Szeged', 'bachelors', 'Music and Performing Arts (BA)', 'Music', null),
    ('University of Szeged', 'bachelors', 'Nurse (BSc)', 'Nursing (Medical & Health Sciences)', null),
    ('University of Szeged', 'bachelors', 'Physiotherapist (BSc)', 'Physiotherapy (Medical & Health Sciences)', null),
    ('University of Szeged', 'bachelors', 'English and American Studies (BA)', 'Humanities', null),
    ('University of Szeged', 'bachelors', 'French Studies (BA)', 'Humanities', null),
    ('University of Szeged', 'bachelors', 'German Studies (BA)', 'Humanities', null),
    ('University of Szeged', 'bachelors', 'Italian Studies (BA)', 'Humanities', null),
    ('University of Szeged', 'bachelors', 'Spanish Studies (BA)', 'Humanities', null),
    ('University of Szeged', 'bachelors', 'Computer Science (BSc)', 'Computer Science', null),
    ('University of Szeged', 'bachelors', 'Computer Science Engineering (BSc)', 'Computer Science', null),
    ('University of Szeged', 'bachelors', 'Business Administration and Management (BSc)', 'Business and Management', null),
    ('University of Szeged', 'bachelors', 'Psychology (BA)', 'Psychology', null),
    ('University of Szeged', 'bachelors', 'Tourism and Catering (BSc)', 'Tourism and Hospitality', null),
    ('University of Szeged', 'masters', 'Classical Musical Instrumental Performance (MA)', 'Music', null),
    ('University of Szeged', 'masters', 'Classical Singing (MA)', 'Music', null),
    ('University of Szeged', 'masters', 'Comparative Intellectual Property Law (LL.M.)', 'Law', null),
    ('University of Szeged', 'masters', 'International and European Trade and Investment Law (LL.M.)', 'Law', null),
    ('University of Szeged', 'masters', 'International Economy and Business (MSc)', 'Business and Management', null),
    ('University of Szeged', 'masters', 'Educational Assessment (MA)', 'Education', null),
    ('University of Szeged', 'masters', 'Educational Science (MA)', 'Education', null),
    ('University of Szeged', 'masters', 'Instruction of English as a Foreign Language (MA)', 'Education', null),
    ('University of Szeged', 'masters', 'Food Safety and Quality Engineering (MSc)', 'Engineering', null),
    ('University of Szeged', 'masters', 'Food Science and Food Technology Engineering (MSc)', 'Engineering', null),
    ('University of Szeged', 'masters', 'Sustainable Agriculture (MSc)', 'Agriculture', null),
    ('University of Szeged', 'masters', 'American Studies (MA)', 'Humanities', null),
    ('University of Szeged', 'masters', 'English Studies (MA)', 'Humanities', null),
    ('University of Szeged', 'masters', 'Philosophy (MA)', 'Humanities', null),
    ('University of Szeged', 'masters', 'Computer Science (MSc)', 'Computer Science', null),
    ('University of Szeged', 'masters', 'Applied Mathematics (MSc)', 'Science', null),
    ('University of Szeged', 'masters', 'Biology (MSc)', 'Science', null),
    ('University of Szeged', 'masters', 'Chemistry (MSc)', 'Science', null),
    ('University of Szeged', 'masters', 'Geography (MSc)', 'Science', null),
    ('University of Szeged', 'masters', 'Geoinformatics (MSc)', 'Science', null),
    ('University of Szeged', 'masters', 'Mathematics (MSc)', 'Science', null),
    ('University of Szeged', 'masters', 'Human Resource Counselling (MA)', 'Social Sciences', null),
    ('University of Szeged', 'masters', 'International Relations (MA)', 'Social Sciences', null)
) as v(uni, level, name, core_field, duration)
join public.universities u
  on u.name = v.uni
 and u.destination_id = (select id from public.destinations where country_code = 'HU')
where not exists (
  -- programs has no unique constraint on (university_id, name, level); the
  -- importer de-duplicates in application code, so this migration has to too.
  select 1 from public.programs p
  where p.university_id = u.id and p.name = v.name and p.level = v.level
);
