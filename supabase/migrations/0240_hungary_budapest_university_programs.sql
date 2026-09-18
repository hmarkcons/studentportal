-- English-taught programmes for five more Hungarian universities.
--
-- Second increment for Hungary, after the medical cluster in 0239. Covers the
-- technical, business, agricultural and veterinary universities — the rest of
-- what Hungary is actually chosen for once medicine is set aside.
--
-- 123 programmes, every one from the university's own English listing:
--
--   Corvinus    uni-corvinus.hu/ind/programs-curriculum-degree/bachelor-programs
--               and .../master-programs
--   BME         xplore.bme.hu/admission/
--   Óbuda       uni-obuda.hu degree-programs-in-english
--   MATE        en.uni-mate.hu/bsc-and-msc-programmes-in-english
--   Univet      univet.hu — the eleven-semester undivided veterinary degree
--
-- Same rules as 0239, for the same reasons. Only entirely English-taught
-- degrees. page_link left null rather than guessed. duration only where the
-- university publishes it. core_field follows each university's own grouping.
--
-- Excluded as not being degree programmes: BME's three preparatory routes
-- (Pre-engineering, Structural Engineering Pre-MSc, Pre-MSc in Architecture)
-- and Corvinus's "ESG Consultant" partial-knowledge training.
--
-- MATE lists both "Agricultural Biotechnology (animal or plant)" and
-- "Agricultural Biotechnology (plant)" as separate master's entries. Both are
-- carried through as published rather than merged into one: they appear to be
-- distinct specialisation tracks, and collapsing them would be editing a
-- university's own prospectus on a guess.
--
-- Eötvös Loránd University is NOT here despite being the largest English
-- provider in the country (70+ programmes). Its listing is behind a
-- JavaScript programme finder that cannot be read reliably, and inventing 70
-- plausible ELTE programme names would be the worst possible outcome. It needs
-- its own pass.

insert into public.programs (university_id, level, name, core_field, duration)
select u.id, v.level, v.name, v.core_field, v.duration
from (
  values
    -- ==================================== Corvinus University of Budapest (40)
    ('Corvinus University of Budapest', 'bachelors', 'Applied Economics', 'Economics', null),
    ('Corvinus University of Budapest', 'bachelors', 'Business Informatics', 'Information Technology', null),
    ('Corvinus University of Budapest', 'bachelors', 'Business Administration and Management', 'Business and Management', null),
    ('Corvinus University of Budapest', 'bachelors', 'Communication and Media Science', 'Communication and Media', null),
    ('Corvinus University of Budapest', 'bachelors', 'Data Science in Business', 'Data Science', null),
    ('Corvinus University of Budapest', 'bachelors', 'International Business Economics', 'Business and Management', null),
    ('Corvinus University of Budapest', 'bachelors', 'International Relations', 'Social Sciences', null),
    ('Corvinus University of Budapest', 'bachelors', 'Sociology', 'Social Sciences', null),
    ('Corvinus University of Budapest', 'bachelors', 'Philosophy, Politics, Economy', 'Social Sciences', null),
    ('Corvinus University of Budapest', 'masters', 'Advanced Supply Chain Management', 'Business and Management', null),
    ('Corvinus University of Budapest', 'masters', 'Agile Entrepreneurship', 'Business and Management', null),
    ('Corvinus University of Budapest', 'masters', 'Artificial Intelligence in Business', 'Data Science', null),
    ('Corvinus University of Budapest', 'masters', 'Business Administration', 'Business and Management', null),
    ('Corvinus University of Budapest', 'masters', 'Business Informatics', 'Information Technology', null),
    ('Corvinus University of Budapest', 'masters', 'Climate Policy and Regional Development', 'Social Sciences', null),
    ('Corvinus University of Budapest', 'masters', 'Communication and Media Studies', 'Communication and Media', null),
    ('Corvinus University of Budapest', 'masters', 'Design Business Society', 'Business and Management', null),
    ('Corvinus University of Budapest', 'masters', 'Digital Innovation', 'Information Technology', null),
    ('Corvinus University of Budapest', 'masters', 'Economic Analysis', 'Economics', null),
    ('Corvinus University of Budapest', 'masters', 'Economic Behavior Analysis', 'Economics', null),
    ('Corvinus University of Budapest', 'masters', 'Finance', 'Finance', null),
    ('Corvinus University of Budapest', 'masters', 'Global Development Policy', 'Social Sciences', null),
    ('Corvinus University of Budapest', 'masters', 'Innovation and Entrepreneurship', 'Business and Management', null),
    ('Corvinus University of Budapest', 'masters', 'International Accounting and Auditing', 'Finance', null),
    ('Corvinus University of Budapest', 'masters', 'International Economy and Business', 'Business and Management', null),
    ('Corvinus University of Budapest', 'masters', 'International MBA', 'Business and Management', null),
    ('Corvinus University of Budapest', 'masters', 'Health Economic Evaluation', 'Economics', null),
    ('Corvinus University of Budapest', 'masters', 'International Relations', 'Social Sciences', null),
    ('Corvinus University of Budapest', 'masters', 'International Sport Business', 'Business and Management', null),
    ('Corvinus University of Budapest', 'masters', 'Intellectual Property Management', 'Law', null),
    ('Corvinus University of Budapest', 'masters', 'Management', 'Business and Management', null),
    ('Corvinus University of Budapest', 'masters', 'Management and Leadership', 'Business and Management', null),
    ('Corvinus University of Budapest', 'masters', 'Marketing', 'Business and Management', null),
    ('Corvinus University of Budapest', 'masters', 'Marketing Strategy and Innovation', 'Business and Management', null),
    ('Corvinus University of Budapest', 'masters', 'Political Economy', 'Economics', null),
    ('Corvinus University of Budapest', 'masters', 'Public Governance', 'Social Sciences', null),
    ('Corvinus University of Budapest', 'masters', 'Public Policy and Management', 'Social Sciences', null),
    ('Corvinus University of Budapest', 'masters', 'Social Data Science', 'Data Science', null),
    ('Corvinus University of Budapest', 'masters', 'Sustainability Management and Entrepreneurship', 'Business and Management', null),
    ('Corvinus University of Budapest', 'masters', 'Strategic Project Management', 'Business and Management', null),

    -- ========== Budapest University of Technology and Economics (BME) (29)
    ('Budapest University of Technology and Economics', 'bachelors', 'Mechanical Engineering', 'Engineering', null),
    ('Budapest University of Technology and Economics', 'bachelors', 'Civil Engineering', 'Engineering', null),
    ('Budapest University of Technology and Economics', 'bachelors', 'Computer Science Engineer', 'Computer Science', null),
    ('Budapest University of Technology and Economics', 'bachelors', 'Electrical Engineer', 'Engineering', null),
    ('Budapest University of Technology and Economics', 'bachelors', 'Mathematics', 'Science', null),
    ('Budapest University of Technology and Economics', 'bachelors', 'Physicist-Engineer', 'Science', null),
    ('Budapest University of Technology and Economics', 'bachelors', 'Logistics Engineer', 'Engineering', null),
    ('Budapest University of Technology and Economics', 'bachelors', 'Transportation Engineer', 'Engineering', null),
    ('Budapest University of Technology and Economics', 'bachelors', 'Vehicle Engineer', 'Engineering', null),
    ('Budapest University of Technology and Economics', 'bachelors', 'Professional Pilot', 'Aviation', null),
    ('Budapest University of Technology and Economics', 'masters', 'Autonomous Vehicle Control Engineer', 'Engineering', null),
    ('Budapest University of Technology and Economics', 'masters', 'Chemical Engineering', 'Engineering', null),
    ('Budapest University of Technology and Economics', 'masters', 'Computer Science Engineer', 'Computer Science', null),
    ('Budapest University of Technology and Economics', 'masters', 'Construction Information Technology Engineer', 'Engineering', null),
    ('Budapest University of Technology and Economics', 'masters', 'Electrical Engineer', 'Engineering', null),
    ('Budapest University of Technology and Economics', 'masters', 'Engineering Manager', 'Engineering', null),
    ('Budapest University of Technology and Economics', 'masters', 'Finance', 'Finance', null),
    ('Budapest University of Technology and Economics', 'masters', 'Infrastructural Engineer', 'Engineering', null),
    ('Budapest University of Technology and Economics', 'masters', 'Integrated MSc Program in Architectural Engineering', 'Architecture / Engineering', null),
    ('Budapest University of Technology and Economics', 'masters', 'Logistics Engineer', 'Engineering', null),
    ('Budapest University of Technology and Economics', 'masters', 'Management and Leadership', 'Business and Management', null),
    ('Budapest University of Technology and Economics', 'masters', 'Master of Science Program in Architecture', 'Architecture / Engineering', null),
    ('Budapest University of Technology and Economics', 'masters', 'Mathematics', 'Science', null),
    ('Budapest University of Technology and Economics', 'masters', 'Physicist', 'Science', null),
    ('Budapest University of Technology and Economics', 'masters', 'Regional and Environmental Economics', 'Economics', null),
    ('Budapest University of Technology and Economics', 'masters', 'Structural Engineer', 'Engineering', null),
    ('Budapest University of Technology and Economics', 'masters', 'Transportation Engineer', 'Engineering', null),
    ('Budapest University of Technology and Economics', 'masters', 'Vehicle Engineer', 'Engineering', null),
    ('Budapest University of Technology and Economics', 'masters', 'Medical Physics', 'Science', null),

    -- ============================================== Óbuda University (12)
    ('Óbuda University', 'bachelors', 'Industrial Product Design Engineering', 'Engineering', null),
    ('Óbuda University', 'bachelors', 'Engineering Management', 'Engineering', null),
    ('Óbuda University', 'bachelors', 'Environmental Engineering', 'Engineering', null),
    ('Óbuda University', 'bachelors', 'Land Surveying and Land Management Engineering', 'Engineering', null),
    ('Óbuda University', 'bachelors', 'Electrical Engineering', 'Engineering', null),
    ('Óbuda University', 'bachelors', 'Mechatronics Engineering', 'Engineering', null),
    ('Óbuda University', 'bachelors', 'Computer Science Engineering', 'Computer Science', null),
    ('Óbuda University', 'masters', 'Mechatronics Engineering', 'Engineering', null),
    ('Óbuda University', 'masters', 'Computer Science Engineering', 'Computer Science', null),
    ('Óbuda University', 'masters', 'Applied Mathematics', 'Science', null),
    ('Óbuda University', 'masters', 'Business Development', 'Business and Management', null),
    ('Óbuda University', 'masters', 'Architecture', 'Architecture / Engineering', null),

    -- ============ Hungarian University of Agriculture and Life Sciences (41)
    ('Hungarian University of Agriculture and Life Sciences', 'bachelors', 'Agricultural Engineering', 'Agriculture', null),
    ('Hungarian University of Agriculture and Life Sciences', 'bachelors', 'Agricultural and Business Digitalization', 'Agriculture', null),
    ('Hungarian University of Agriculture and Life Sciences', 'bachelors', 'Biochemical Engineering', 'Engineering', null),
    ('Hungarian University of Agriculture and Life Sciences', 'bachelors', 'Business Administration and Management', 'Business and Management', null),
    ('Hungarian University of Agriculture and Life Sciences', 'bachelors', 'Environmental Engineering', 'Engineering', null),
    ('Hungarian University of Agriculture and Life Sciences', 'bachelors', 'Film and Media Studies', 'Communication and Media', null),
    ('Hungarian University of Agriculture and Life Sciences', 'bachelors', 'Food Engineering', 'Food Science', null),
    ('Hungarian University of Agriculture and Life Sciences', 'bachelors', 'Horticultural Engineering', 'Agriculture', null),
    ('Hungarian University of Agriculture and Life Sciences', 'bachelors', 'Landscape Management and Garden Construction Engineering', 'Agriculture', null),
    ('Hungarian University of Agriculture and Life Sciences', 'bachelors', 'Mechanical Engineering', 'Engineering', null),
    ('Hungarian University of Agriculture and Life Sciences', 'bachelors', 'Tourism and Catering', 'Tourism and Hospitality', null),
    ('Hungarian University of Agriculture and Life Sciences', 'bachelors', 'Wildlife Management Engineering', 'Agriculture', null),
    ('Hungarian University of Agriculture and Life Sciences', 'masters', 'Agricultural Biotechnology (animal or plant)', 'Agriculture', null),
    ('Hungarian University of Agriculture and Life Sciences', 'masters', 'Agricultural Biotechnology (plant)', 'Agriculture', null),
    ('Hungarian University of Agriculture and Life Sciences', 'masters', 'Agricultural Economist', 'Agriculture', null),
    ('Hungarian University of Agriculture and Life Sciences', 'masters', 'Agricultural Water Management Engineering', 'Agriculture', null),
    ('Hungarian University of Agriculture and Life Sciences', 'masters', 'Animal Nutrition and Feed Safety Engineering', 'Agriculture', null),
    ('Hungarian University of Agriculture and Life Sciences', 'masters', 'Animal Husbandry Engineering', 'Agriculture', null),
    ('Hungarian University of Agriculture and Life Sciences', 'masters', 'Aquaculture', 'Agriculture', null),
    ('Hungarian University of Agriculture and Life Sciences', 'masters', 'Biosystems Engineering', 'Engineering', null),
    ('Hungarian University of Agriculture and Life Sciences', 'masters', 'Business Development', 'Business and Management', null),
    ('Hungarian University of Agriculture and Life Sciences', 'masters', 'Crop Production Engineering', 'Agriculture', null),
    ('Hungarian University of Agriculture and Life Sciences', 'masters', 'Danube AgriFood Master', 'Agriculture', null),
    ('Hungarian University of Agriculture and Life Sciences', 'masters', 'Ecotoxicology', 'Science', null),
    ('Hungarian University of Agriculture and Life Sciences', 'masters', 'Engineering Management', 'Engineering', null),
    ('Hungarian University of Agriculture and Life Sciences', 'masters', 'Environmental Engineering', 'Engineering', null),
    ('Hungarian University of Agriculture and Life Sciences', 'masters', 'Finance', 'Finance', null),
    ('Hungarian University of Agriculture and Life Sciences', 'masters', 'Food Safety and Quality Engineering', 'Food Science', null),
    ('Hungarian University of Agriculture and Life Sciences', 'masters', 'Food Science and Technology Engineering', 'Food Science', null),
    ('Hungarian University of Agriculture and Life Sciences', 'masters', 'Horticultural Engineering', 'Agriculture', null),
    ('Hungarian University of Agriculture and Life Sciences', 'masters', 'Landscape Architecture and Garden Design', 'Architecture / Engineering', null),
    ('Hungarian University of Agriculture and Life Sciences', 'masters', 'Management and Leadership', 'Business and Management', null),
    ('Hungarian University of Agriculture and Life Sciences', 'masters', 'Mechanical Engineering', 'Engineering', null),
    ('Hungarian University of Agriculture and Life Sciences', 'masters', 'Photography', 'Arts and Design', null),
    ('Hungarian University of Agriculture and Life Sciences', 'masters', 'Plant Protection', 'Agriculture', null),
    ('Hungarian University of Agriculture and Life Sciences', 'masters', 'Rural Development Engineering', 'Agriculture', null),
    ('Hungarian University of Agriculture and Life Sciences', 'masters', 'Supply Chain Management', 'Business and Management', null),
    ('Hungarian University of Agriculture and Life Sciences', 'masters', 'Tourism Management', 'Tourism and Hospitality', null),
    ('Hungarian University of Agriculture and Life Sciences', 'masters', 'Urban Systems Engineering', 'Engineering', null),
    ('Hungarian University of Agriculture and Life Sciences', 'masters', 'Viticulture and Oenology Engineering', 'Agriculture', null),
    ('Hungarian University of Agriculture and Life Sciences', 'masters', 'Wildlife Management Engineering', 'Agriculture', null),

    -- =============== University of Veterinary Medicine Budapest (1)
    -- Hungary's only veterinary school. The training is undivided over eleven
    -- semesters, which is why this is a single 'bachelors' row rather than a
    -- BSc/MSc pair — the same treatment the one-tier medical degrees get.
    ('University of Veterinary Medicine Budapest', 'bachelors', 'Veterinary Medicine', 'Veterinary Medicine (Medical & Health Sciences)', '5.5 years (11 semesters)')
) as v(uni, level, name, core_field, duration)
join public.universities u
  on u.name = v.uni
 and u.destination_id = (select id from public.destinations where country_code = 'HU')
where not exists (
  select 1 from public.programs p
  where p.university_id = u.id and p.name = v.name and p.level = v.level
);
