-- English-taught programmes for two more Hungarian universities.
--
-- Fourth and final Hungary increment from research. Sources:
--
--   John von Neumann   nje.hu/en/study-programmes/in-english
--   METU               studyinhungary.hu institution page — the Hungarian
--                      government's own study portal, used because the
--                      university's site 404s on every programmes URL it
--                      advertises, including the one its old domain redirects
--                      to
--
-- Same rules as 0239-0241: entirely English-taught degrees only, page_link
-- null rather than guessed, duration only where published, core_field per the
-- source's grouping. John von Neumann's preparatory course in English and
-- Mathematics is excluded, being a preparatory route rather than a degree.
--
-- ---------------------------------------------------------------------------
-- WHAT IS STILL MISSING, AND WHY IT IS NOT GUESSED AT
--
-- Ten of Hungary's 23 universities remain without programmes. In every case
-- the obstacle is the same: no accessible source that distinguishes
-- English-taught degrees from Hungarian-taught ones. Filling these in by
-- inference would put programmes a student cannot actually take onto their
-- application, which is worse than an empty catalogue because it looks
-- complete.
--
--   Eötvös Loránd        100+ English programmes, the largest provider in the
--                        country. Behind a JavaScript programme finder;
--                        /en/degree-programmes, /en/degree-programs and
--                        /en/find-degree-program all fail, and the government
--                        portal only repeats the count.
--   Miskolc              10 English BSc and 16 English MSc, but the site lists
--                        all 141 of its degrees without marking which are in
--                        English, and its englishstudyprogrammes subdomain no
--                        longer resolves.
--   Pannonia             27 English programmes by its own count, named on no
--                        reachable page; its admission portal redirects in a
--                        loop back to the overview.
--   Sopron, Dunaújváros, Nyíregyháza, Eszterházy Károly, MOME,
--   Pázmány Péter, Károli Gáspár
--                        small or specialised institutions with little or no
--                        published English portfolio.
--
-- These want a prospectus from the institution or HMARK's Hungary contact,
-- which the CSV importer on each university page will take directly.

insert into public.programs (university_id, level, name, core_field, duration)
select u.id, v.level, v.name, v.core_field, v.duration
from (
  values
    -- ===================================== John von Neumann University (10)
    ('John von Neumann University', 'bachelors', 'Tourism and Catering', 'Tourism and Hospitality', null),
    ('John von Neumann University', 'bachelors', 'Business Administration and Management', 'Business and Management', null),
    ('John von Neumann University', 'bachelors', 'International Business Economics', 'Business and Management', null),
    ('John von Neumann University', 'bachelors', 'Vehicle Engineering', 'Engineering', null),
    ('John von Neumann University', 'bachelors', 'Computer Science Engineering', 'Computer Science', null),
    ('John von Neumann University', 'bachelors', 'Mechanical Engineering', 'Engineering', null),
    ('John von Neumann University', 'bachelors', 'Logistics Engineering', 'Engineering', null),
    ('John von Neumann University', 'bachelors', 'Horticultural Engineering', 'Agriculture', null),
    ('John von Neumann University', 'masters', 'Regional and Environmental Economics', 'Economics', null),
    ('John von Neumann University', 'masters', 'Master of Business Administration (MBA)', 'Business and Management', null),

    -- ================================ Budapest Metropolitan University (16)
    ('Budapest Metropolitan University', 'bachelors', 'Business Administration and Management', 'Business and Management', null),
    ('Budapest Metropolitan University', 'bachelors', 'Commerce and Marketing', 'Business and Management', null),
    ('Budapest Metropolitan University', 'bachelors', 'Communication and Media Science', 'Communication and Media', null),
    ('Budapest Metropolitan University', 'bachelors', 'International Relations', 'Social Sciences', null),
    ('Budapest Metropolitan University', 'bachelors', 'Tourism and Catering', 'Tourism and Hospitality', null),
    ('Budapest Metropolitan University', 'bachelors', 'Animation', 'Arts and Design', null),
    ('Budapest Metropolitan University', 'bachelors', 'Environmental Design', 'Arts and Design', null),
    ('Budapest Metropolitan University', 'bachelors', 'Graphic Design', 'Arts and Design', null),
    ('Budapest Metropolitan University', 'bachelors', 'Film and Media Studies', 'Communication and Media', null),
    ('Budapest Metropolitan University', 'masters', 'Management and Leadership', 'Business and Management', null),
    ('Budapest Metropolitan University', 'masters', 'Marketing', 'Business and Management', null),
    ('Budapest Metropolitan University', 'masters', 'Communication and Media Studies', 'Communication and Media', null),
    ('Budapest Metropolitan University', 'masters', 'Master of Business Administration (MBA)', 'Business and Management', null),
    ('Budapest Metropolitan University', 'masters', 'Tourism Management', 'Tourism and Hospitality', null),
    ('Budapest Metropolitan University', 'masters', 'Art and Design Management', 'Arts and Design', null),
    ('Budapest Metropolitan University', 'masters', 'Graphic Design', 'Arts and Design', null)
) as v(uni, level, name, core_field, duration)
join public.universities u
  on u.name = v.uni
 and u.destination_id = (select id from public.destinations where country_code = 'HU')
where not exists (
  select 1 from public.programs p
  where p.university_id = u.id and p.name = v.name and p.level = v.level
);
