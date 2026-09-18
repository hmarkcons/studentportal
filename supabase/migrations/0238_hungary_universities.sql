-- Fill out Hungary's university catalogue.
--
-- Hungary had exactly one university on file, University of Pécs, with 16
-- programmes against it. So the destination was in use rather than unstarted —
-- but Hungary's draw for Pakistani students is English-taught medicine, and
-- three of the four medical universities were missing, Semmelweis included.
-- A counselor could not file the most likely application in the country.
--
-- type is 'public', matching "Hungary (Public)" and the rule holding across
-- every destination: a university carries its DESTINATION's track, not its own
-- ownership (see 0236). That matters more here than anywhere else, because
-- most Hungarian state universities were transferred to public-interest asset
-- management foundations between 2019 and 2021 and several of the rows below
-- are church-run or private. None of that changes the track.
--
-- Names were checked, not recalled. Hungary reorganised its higher education
-- heavily and a superseded name would put a non-existent institution on a
-- student's application. Deliberately ABSENT, because they no longer exist:
--
--   Szent István University      merged into MATE on 1 February 2021
--   Kaposvár University          merged into MATE on 1 February 2021
--   University of West Hungary   split up; Sopron is the surviving part
--   Budapest Business School     became Budapest Business University, then
--   Budapest Business University became Budapest University of Economics and
--                                Business on 1 February 2025 — the name used
--                                here
--
-- Wikipedia's list-of-universities page still shows Szent István and West
-- Hungary as current, which is why it was not trusted on its own.
--
-- Institutions have been left out where the current English name could not be
-- established with confidence. An incomplete catalogue is recoverable; a
-- wrong institution name on a visa application is not.

-- Pécs predates the convention of recording a city. It is the one existing row
-- and there is no reason for it to be the only Hungarian entry without one.
update public.universities u
set city = 'Pécs'
where u.name = 'University of Pécs'
  and u.city is null
  and u.destination_id = (select id from public.destinations where country_code = 'HU');

insert into public.universities (destination_id, name, city, type)
select d.id, v.name, v.city, 'public'::destination_track
from (
  values
    -- The three medical universities missing alongside Pécs. Semmelweis is the
    -- top-ranked medical school in Central and Eastern Europe and was absent.
    ('Semmelweis University', 'Budapest'),
    ('University of Debrecen', 'Debrecen'),
    ('University of Szeged', 'Szeged'),
    -- The major comprehensives and technical universities.
    ('Eötvös Loránd University', 'Budapest'),
    ('Budapest University of Technology and Economics', 'Budapest'),
    ('Corvinus University of Budapest', 'Budapest'),
    ('Óbuda University', 'Budapest'),
    -- Renamed from Budapest Business University on 1 February 2025.
    ('Budapest University of Economics and Business', 'Budapest'),
    -- Formed 1 February 2021 from Szent István University, Kaposvár
    -- University, the Gyöngyös campus of Eszterházy Károly and Pannonia's
    -- Georgikon faculty.
    ('Hungarian University of Agriculture and Life Sciences', 'Gödöllő'),
    ('University of Veterinary Medicine Budapest', 'Budapest'),
    ('University of Miskolc', 'Miskolc'),
    ('University of Pannonia', 'Veszprém'),
    ('Széchenyi István University', 'Győr'),
    ('John von Neumann University', 'Kecskemét'),
    ('University of Sopron', 'Sopron'),
    ('University of Dunaújváros', 'Dunaújváros'),
    ('University of Nyíregyháza', 'Nyíregyháza'),
    ('Eszterházy Károly Catholic University', 'Eger'),
    ('Moholy-Nagy University of Art and Design', 'Budapest'),
    -- Church-run and private institutions that take international students.
    -- Filed 'public' like everything else here: the column is the destination's
    -- track, not the institution's ownership.
    ('Pázmány Péter Catholic University', 'Budapest'),
    ('Károli Gáspár University of the Reformed Church', 'Budapest'),
    ('Budapest Metropolitan University', 'Budapest')
) as v(name, city)
cross join (select id from public.destinations where country_code = 'HU') d
where not exists (
  select 1 from public.universities u where u.destination_id = d.id and u.name = v.name
);
