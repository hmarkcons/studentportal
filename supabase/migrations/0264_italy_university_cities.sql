-- Where Italy's universities actually are.
--
-- 26 of the 28 had no city. It shows on the staff Applications list beside the
-- university name, and it is a column of the catalogue sheet, so every export
-- carried 338 blank cells that somebody would eventually have filled in by
-- hand from the same source used here: the name itself.
--
-- Which is what makes this safe to do, unlike the fees and the deadlines. The
-- city is not a figure anybody has to look up — it is written into the name of
-- all but three of them, and those three are called out below.
--
-- Italian spellings, not English: Milano and Torino rather than Milan and
-- Turin. That is the convention the two universities that already had a city
-- set (Padova, Ferrara), it matches the university names themselves, and it is
-- what a student reads on a Universitaly portal and a train ticket.

update public.universities u
   set city = c.city
  from (values
    ('Alma Mater Studiorum – Università di Bologna',     'Bologna'),
    ('Politecnico di Milano',                            'Milano'),
    ('Politecnico di Torino',                            'Torino'),
    ('Sapienza Università di Roma',                      'Roma'),
    ('Università Ca'' Foscari Venezia',                  'Venezia'),
    ('Università degli Studi dell''Aquila',              'L''Aquila'),
    -- Not in the name. Università della Campania "Luigi Vanvitelli" is seated
    -- in Caserta, with faculties across Napoli, Aversa, Capua and Santa Maria
    -- Capua Vetere. Caserta is the administrative seat and the address a
    -- student writes to.
    ('Università degli Studi della Campania',            'Caserta'),
    ('Università degli Studi di Bergamo',                'Bergamo'),
    ('Università degli Studi di Brescia',                'Brescia'),
    ('Università degli Studi di Catania',                'Catania'),
    ('Università degli Studi di Firenze',                'Firenze'),
    ('Università degli Studi di Genova',                 'Genova'),
    ('Università degli Studi di Messina',                'Messina'),
    ('Università degli Studi di Milano (Statale)',       'Milano'),
    ('Università degli Studi di Milano-Bicocca',         'Milano'),
    -- Two seats, both in the name. Modena holds the rectorate and is the
    -- larger of the two; a student at the Reggio Emilia campus is in the
    -- other. One column cannot say both, and Modena is the better single
    -- answer.
    ('Università degli Studi di Modena e Reggio Emilia', 'Modena'),
    ('Università degli Studi di Perugia',                'Perugia'),
    ('Università degli Studi di Siena',                  'Siena'),
    ('Università degli Studi di Trieste',                'Trieste'),
    ('Università degli Studi di Udine',                  'Udine'),
    ('Università degli Studi di Verona',                 'Verona'),
    ('Università di Parma',                              'Parma'),
    ('Università di Pavia',                              'Pavia'),
    ('Università di Pisa',                               'Pisa'),
    ('Università Iuav di Venezia',                       'Venezia'),
    -- Not in the name either: the Marche is the region, and the university is
    -- in Ancona, its capital.
    ('Università Politecnica delle Marche',              'Ancona')
  ) as c(name, city)
 where u.name = c.name
   and u.destination_id = (select id from public.destinations where display_name = 'Italy (Public)')
   -- Gaps only, so a city somebody has corrected by hand survives and a second
   -- run changes nothing.
   and u.city is null;

-- The outcome, not the mechanism.
--
-- Checking "did all 26 names match" would need the list written out twice. This
-- asks the better question and needs it once: is any Italy university still
-- without a city? A name mistyped here — an accent, an apostrophe, the en-dash
-- in the Bologna one — leaves that university blank, and that is exactly what
-- this catches. Silently skipping one while reporting success is the whole
-- failure mode.
do $$
declare
  missing text;
begin
  select string_agg(u.name, ', ' order by u.name) into missing
  from public.universities u
  join public.destinations d on d.id = u.destination_id
  where d.display_name = 'Italy (Public)'
    and (u.city is null or btrim(u.city) = '');

  if missing is not null then
    raise exception '0264: these Italy universities still have no city: %', missing;
  end if;
end $$;

-- Not touched, and deliberately so: universities.region on Ferrara and Padova
-- holds "Ergo" and "ESU Padova", which are the names of their regional
-- student-aid agencies rather than regions — both exist properly in
-- scholarship_bodies, against the regions Emilia-Romagna and Veneto. Nothing in
-- the app reads universities.region, so it is wrong rather than broken, and
-- correcting somebody's entry is a separate decision from filling in blanks.
