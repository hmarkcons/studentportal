-- Give Ireland and Romania a university catalogue.
--
-- Both destinations were fully configured — pipeline stages, document
-- checklists, visa offices, a researched visa page — and had zero
-- universities. Nothing could be applied for, so no student could ever reach
-- either visa page: an application needs a university, and there were none to
-- pick. The two countries were live in every respect except the one that makes
-- them usable.
--
-- universities.type is the enum `destination_track` ('public' | 'private'), and
-- it is the DESTINATION's commercial track rather than the institution's legal
-- ownership. That is not a guess: UCL, Imperial and LSE sit under
-- "United Kingdom (Private)", and Ankara, Hacettepe and Boğaziçi under
-- "Turkey (Private)", all of which are state-funded. The rule that actually
-- holds across all 18 destinations is that every university carries its
-- destination's track. So Ireland's rows are 'private', matching
-- "Ireland (Private)" and the UK's convention, and Romania's are 'public',
-- matching "Romania (Public)".
--
-- city is populated, which the existing 240 rows leave null. The column is
-- rendered on the application page ("programme · city") and these are stable,
-- checkable facts; there is no reason to withhold them just because older rows
-- predate anyone filling them in.
--
-- levels_offered and fields_offered are left at their empty defaults, as every
-- other row has them. They are import-only columns and nothing reads them.
--
-- Guarded by NOT EXISTS on (destination_id, name): universities has no unique
-- constraint on the name — the importer de-duplicates in application code —
-- so without this, re-running would double the catalogue.

-- ---------------------------------------------------------------- Ireland
--
-- The seven universities, the five technological universities that replaced
-- the institutes of technology, the two institutes that stayed independent,
-- and the private colleges that take Pakistani students directly.
insert into public.universities (destination_id, name, city, type)
select d.id, v.name, v.city, 'private'::destination_track
from (
  values
    ('University College Dublin', 'Dublin'),
    ('Trinity College Dublin', 'Dublin'),
    ('University of Galway', 'Galway'),
    ('University College Cork', 'Cork'),
    ('Dublin City University', 'Dublin'),
    ('University of Limerick', 'Limerick'),
    ('Maynooth University', 'Maynooth'),
    -- Ireland's five technological universities. The former institutes of
    -- technology merged into these between 2019 and 2022, so the old IT names
    -- are deliberately absent — an application filed against "Cork Institute
    -- of Technology" would name an institution that no longer exists.
    ('Technological University Dublin', 'Dublin'),
    ('Munster Technological University', 'Cork'),
    ('Atlantic Technological University', 'Galway'),
    ('South East Technological University', 'Waterford'),
    ('Technological University of the Shannon', 'Limerick'),
    -- The two institutes that did not merge and are still institutes.
    ('Dundalk Institute of Technology', 'Dundalk'),
    ('Institute of Art, Design and Technology', 'Dún Laoghaire'),
    ('Royal College of Surgeons in Ireland', 'Dublin'),
    ('National College of Ireland', 'Dublin'),
    ('Griffith College', 'Dublin'),
    ('Dublin Business School', 'Dublin')
) as v(name, city)
cross join (select id from public.destinations where country_code = 'IE') d
where not exists (
  select 1 from public.universities u where u.destination_id = d.id and u.name = v.name
);

-- ---------------------------------------------------------------- Romania
--
-- The comprehensive and technical state universities, plus the six medical
-- universities — medicine taught in English is the reason most Pakistani
-- students look at Romania at all, so leaving those out would miss the point
-- of the destination.
insert into public.universities (destination_id, name, city, type)
select d.id, v.name, v.city, 'public'::destination_track
from (
  values
    ('University of Bucharest', 'Bucharest'),
    ('Babeș-Bolyai University', 'Cluj-Napoca'),
    ('Alexandru Ioan Cuza University of Iași', 'Iași'),
    ('West University of Timișoara', 'Timișoara'),
    ('Bucharest University of Economic Studies', 'Bucharest'),
    -- Renamed on 1 August 2023, when Politehnica University of Bucharest
    -- absorbed the University of Piteşti. Piteşti is therefore absent: it is
    -- not a separate institution any more.
    ('National University of Science and Technology Politehnica Bucharest', 'Bucharest'),
    ('Technical University of Cluj-Napoca', 'Cluj-Napoca'),
    ('Politehnica University of Timișoara', 'Timișoara'),
    ('Gheorghe Asachi Technical University of Iași', 'Iași'),
    ('Technical University of Civil Engineering Bucharest', 'Bucharest'),
    ('Transilvania University of Brașov', 'Brașov'),
    ('Lucian Blaga University of Sibiu', 'Sibiu'),
    ('University of Craiova', 'Craiova'),
    ('University of Oradea', 'Oradea'),
    ('Dunărea de Jos University of Galați', 'Galați'),
    ('Ovidius University of Constanța', 'Constanța'),
    -- The medical universities, all of which run English-taught Medicine.
    ('Carol Davila University of Medicine and Pharmacy', 'Bucharest'),
    ('Iuliu Hațieganu University of Medicine and Pharmacy', 'Cluj-Napoca'),
    ('Grigore T. Popa University of Medicine and Pharmacy', 'Iași'),
    ('Victor Babeș University of Medicine and Pharmacy', 'Timișoara'),
    ('George Emil Palade University of Medicine, Pharmacy, Science and Technology of Târgu Mureș', 'Târgu Mureș')
) as v(name, city)
cross join (select id from public.destinations where country_code = 'RO') d
where not exists (
  select 1 from public.universities u where u.destination_id = d.id and u.name = v.name
);
