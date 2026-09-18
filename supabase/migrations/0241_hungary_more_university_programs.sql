-- English-taught programmes for two more Hungarian universities.
--
-- Third Hungary increment. Sources, both the universities' own admissions
-- sites:
--
--   BUEB        uni-bge.hu/en/bachelors-program, /en/masters-programmes-in-english
--   Széchenyi   admissions.sze.hu/bachelors-level-full-degree-programmes
--               and .../masters-level-full-degree-programmes
--
-- Same rules as 0239 and 0240: entirely English-taught degrees only,
-- page_link null rather than guessed, duration only where published,
-- core_field per the university's own grouping.
--
-- Széchenyi's master's listing groups some performing-arts degrees as a base
-- degree plus unnamed specialisations ("MA in Classical Musical Instrument
-- Performance" with several, "MA in Conducting" variants). The base degree is
-- recorded once; the specialisations are not, because the listing does not
-- name them and inventing instrument-by-instrument rows would be fabrication.
--
-- The University of Miskolc is deliberately absent. It publishes 10 English
-- bachelor's and 16 English master's programmes, but its site lists all 141 of
-- its degrees without marking which are English-taught, and its dedicated
-- English-programmes subdomain no longer resolves. Picking 26 out of 141 by
-- guesswork would put Hungarian-taught degrees in front of students who cannot
-- take them, so it needs a source that actually distinguishes them.

insert into public.programs (university_id, level, name, core_field, duration)
select u.id, v.level, v.name, v.core_field, v.duration
from (
  values
    -- ================= Budapest University of Economics and Business (9)
    ('Budapest University of Economics and Business', 'bachelors', 'Business Administration and Management', 'Business and Management', null),
    ('Budapest University of Economics and Business', 'bachelors', 'Commerce and Marketing', 'Business and Management', null),
    ('Budapest University of Economics and Business', 'bachelors', 'Communication and Media Studies', 'Communication and Media', null),
    ('Budapest University of Economics and Business', 'bachelors', 'International Business Economics', 'Business and Management', null),
    ('Budapest University of Economics and Business', 'bachelors', 'Finance and Accounting', 'Finance', null),
    ('Budapest University of Economics and Business', 'bachelors', 'Tourism and Catering', 'Tourism and Hospitality', null),
    ('Budapest University of Economics and Business', 'masters', 'International Economy and Business', 'Business and Management', null),
    ('Budapest University of Economics and Business', 'masters', 'International Relations', 'Social Sciences', null),
    ('Budapest University of Economics and Business', 'masters', 'Tourism Management', 'Tourism and Hospitality', null),

    -- ========================= Széchenyi István University, Győr (42)
    ('Széchenyi István University', 'bachelors', 'Vehicle Engineering', 'Engineering', null),
    ('Széchenyi István University', 'bachelors', 'Mechanical Engineering', 'Engineering', null),
    ('Széchenyi István University', 'bachelors', 'Civil Engineering', 'Engineering', null),
    ('Széchenyi István University', 'bachelors', 'Logistics Engineering', 'Engineering', null),
    ('Széchenyi István University', 'bachelors', 'Agricultural Engineering', 'Agriculture', null),
    ('Széchenyi István University', 'bachelors', 'Agricultural Water Management and Environmental Technology Engineering', 'Agriculture', null),
    ('Széchenyi István University', 'bachelors', 'Food Engineering', 'Food Science', null),
    ('Széchenyi István University', 'bachelors', 'Business Administration and Management', 'Business and Management', null),
    ('Széchenyi István University', 'bachelors', 'International Business Economics', 'Business and Management', null),
    ('Széchenyi István University', 'bachelors', 'Tourism and Catering', 'Tourism and Hospitality', null),
    ('Széchenyi István University', 'bachelors', 'International Relations', 'Social Sciences', null),
    ('Széchenyi István University', 'bachelors', 'Sociology', 'Social Sciences', null),
    ('Széchenyi István University', 'bachelors', 'Recreation Management and Health Promotion', 'Sport and Health Sciences', null),
    ('Széchenyi István University', 'bachelors', 'Nursing and Patient Care - Nurse specialization', 'Nursing (Medical & Health Sciences)', null),
    ('Széchenyi István University', 'bachelors', 'Business Informatics', 'Information Technology', null),
    ('Széchenyi István University', 'bachelors', 'Electrical Engineering', 'Engineering', null),
    ('Széchenyi István University', 'masters', 'Vehicle Engineering', 'Engineering', null),
    ('Széchenyi István University', 'masters', 'Motorsport Engineering', 'Engineering', null),
    ('Széchenyi István University', 'masters', 'Mechanical Engineering', 'Engineering', null),
    ('Széchenyi István University', 'masters', 'Modern Technologies and Cybersecurity Law', 'Law', null),
    ('Széchenyi István University', 'masters', 'Digital Child Rights and Youth Protection', 'Law', null),
    ('Széchenyi István University', 'masters', 'Infrastructural Engineering', 'Engineering', null),
    ('Széchenyi István University', 'masters', 'Architecture', 'Architecture / Engineering', null),
    ('Széchenyi István University', 'masters', 'Supply Chain Management', 'Business and Management', null),
    ('Széchenyi István University', 'masters', 'Marketing', 'Business and Management', null),
    ('Széchenyi István University', 'masters', 'International Economics and Business', 'Business and Management', null),
    ('Széchenyi István University', 'masters', 'Tourism Management', 'Tourism and Hospitality', null),
    ('Széchenyi István University', 'masters', 'Regional and Environmental Economic Studies', 'Economics', null),
    ('Széchenyi István University', 'masters', 'ESG Expert', 'Business and Management', null),
    ('Széchenyi István University', 'masters', 'Computer Science Engineering', 'Computer Science', null),
    ('Széchenyi István University', 'masters', 'Computer Science', 'Computer Science', null),
    ('Széchenyi István University', 'masters', 'Business Informatics', 'Information Technology', null),
    ('Széchenyi István University', 'masters', 'Electrical Engineering', 'Engineering', null),
    ('Széchenyi István University', 'masters', 'Classical Musical Instrument Performance', 'Music', null),
    ('Széchenyi István University', 'masters', 'Conducting', 'Music', null),
    ('Széchenyi István University', 'masters', 'Orchestral Music Performance', 'Music', null),
    ('Széchenyi István University', 'masters', 'Design', 'Arts and Design', null),
    ('Széchenyi István University', 'masters', 'Health Psychology', 'Psychology', null),
    ('Széchenyi István University', 'masters', 'Health Care Management', 'Health Management', null),
    ('Széchenyi István University', 'masters', 'Nutritional Sciences', 'Dietetics (Medical & Health Sciences)', null),
    ('Széchenyi István University', 'masters', 'Specialist Coaching', 'Sport and Health Sciences', null),
    ('Széchenyi István University', 'masters', 'Human Resource Counselling', 'Social Sciences', null)
) as v(uni, level, name, core_field, duration)
join public.universities u
  on u.name = v.uni
 and u.destination_id = (select id from public.destinations where country_code = 'HU')
where not exists (
  select 1 from public.programs p
  where p.university_id = u.id and p.name = v.name and p.level = v.level
);
