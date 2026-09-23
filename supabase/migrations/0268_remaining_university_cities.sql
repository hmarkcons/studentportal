-- Where the other 78 universities are: Austria, Finland, France, Germany,
-- Luxembourg.
--
-- 0264 did Italy's 28. These five destinations were the rest of the gap — every
-- other destination already had cities on file. Like Italy's, the city shows on
-- the staff Applications list and is a column of the catalogue sheet.
--
-- ------------------------------------------------------------ the spellings
--
-- English where the university's own name already uses the English exonym, the
-- local spelling otherwise. So Vienna, Munich and Cologne — the names here read
-- "University of Vienna", "LMU Munich", "University of Cologne" — but
-- Jyväskylä, Göttingen, Tübingen and Lappeenranta, which have no English form
-- anybody uses.
--
-- That is the opposite of 0264, where Italy's cities are Italian. It is the
-- same rule applied to different data rather than a change of mind: follow the
-- names as they are stored. Italy's universities are stored in Italian
-- ("Università di Pavia"), these are stored in English ("University of
-- Vienna"), and a city written in the other language to its own university
-- reads as a mistake. It also matches the house data already in place —
-- Sweden has Gothenburg, Romania has Bucharest alongside Timișoara and Iași.
--
-- ------------------------------------------------- the eleven not in the name
--
-- Austria's 22 and Germany's 22 all carry their city in the name. Eleven of the
-- rest do not, and each is commented where it appears below. They are ordinary
-- verifiable facts rather than judgement calls about money or dates, and a
-- wrong one is a cosmetic error on a staff list that takes one edit to fix —
-- but they are the ones to check if any of this looks wrong.

update public.universities u
   set city = c.city
  from (values
    -- ---------------------------------------------------------- Austria (22)
    ('Academy of Fine Arts Vienna',                                        'Vienna'),
    ('Alpen-Adria University of Klagenfurt',                               'Klagenfurt'),
    ('Johannes Kepler University Linz (JKU)',                              'Linz'),
    ('Medical University of Graz',                                         'Graz'),
    ('Medical University of Innsbruck',                                    'Innsbruck'),
    ('Medical University of Vienna',                                       'Vienna'),
    ('Montanuniversität Leoben',                                           'Leoben'),
    ('TU Graz',                                                            'Graz'),
    ('TU Wien',                                                            'Vienna'),
    ('University for Continuing Education Krems (Danube University)',      'Krems an der Donau'),
    ('University of Applied Arts Vienna',                                  'Vienna'),
    ('University of Art and Industrial Design Linz (Kunstuniversität Linz)', 'Linz'),
    ('University of Graz (Karl-Franzens-Universität)',                     'Graz'),
    ('University of Innsbruck',                                            'Innsbruck'),
    ('University of Music and Performing Arts Graz (KUG)',                 'Graz'),
    ('University of Music and Performing Arts Vienna (mdw)',               'Vienna'),
    ('University of Natural Resources and Life Sciences, Vienna (BOKU)',   'Vienna'),
    ('University of Salzburg',                                             'Salzburg'),
    ('University of Veterinary Medicine Vienna (Vetmeduni)',               'Vienna'),
    ('University of Vienna',                                               'Vienna'),
    ('Universität Mozarteum Salzburg',                                     'Salzburg'),
    ('WU Vienna (Vienna University of Economics and Business)',            'Vienna'),

    -- ---------------------------------------------------------- Finland (13)
    -- Aalto is in Espoo, not Helsinki: the Otaniemi campus is across the
    -- municipal boundary, and it is the address students are given.
    ('Aalto University',                                                   'Espoo'),
    -- Hanken has two campuses, Helsinki and Vaasa; Helsinki is the main one.
    ('Hanken School of Economics',                                         'Helsinki'),
    ('LUT University (Lappeenranta-Lahti University of Technology)',       'Lappeenranta'),
    ('Tampere University',                                                 'Tampere'),
    -- Joensuu and Kuopio; Joensuu holds the rectorate.
    ('University of Eastern Finland',                                      'Joensuu'),
    ('University of Helsinki',                                             'Helsinki'),
    ('University of Jyväskylä',                                            'Jyväskylä'),
    -- "Lapland" is the region. The university is in Rovaniemi, its capital.
    ('University of Lapland',                                              'Rovaniemi'),
    ('University of Oulu',                                                 'Oulu'),
    ('University of Turku',                                                'Turku'),
    ('University of Vaasa',                                                'Vaasa'),
    ('University of the Arts Helsinki',                                    'Helsinki'),
    -- Åbo is the Swedish name for Turku, where this Swedish-language
    -- university is; it also teaches in Vaasa.
    ('Åbo Akademi University',                                             'Turku'),

    -- ----------------------------------------------------------- France (20)
    -- Two cities in the name. Marseille is the seat; Aix-en-Provence is the
    -- other half.
    ('Aix-Marseille Université',                                           'Marseille'),
    ('Nantes Université',                                                  'Nantes'),
    -- Named for the Sorbonne, which is in Paris.
    ('Sorbonne Université',                                                'Paris'),
    ('University of Rennes',                                               'Rennes'),
    -- "Côte d'Azur" is the coastline. The university is seated in Nice.
    ('Université Côte d''Azur',                                            'Nice'),
    ('Université Grenoble Alpes',                                          'Grenoble'),
    ('Université PSL (Paris Sciences & Lettres)',                          'Paris'),
    ('Université Paris 1 Panthéon-Sorbonne',                               'Paris'),
    ('Université Paris Cité',                                              'Paris'),
    ('Université Paris Dauphine-PSL',                                      'Paris'),
    -- Paris-Saclay is a campus cluster south-west of Paris, not a commune.
    -- Its seat is in Gif-sur-Yvette.
    ('Université Paris-Saclay',                                            'Gif-sur-Yvette'),
    ('Université Sorbonne Nouvelle (Paris 3)',                             'Paris'),
    ('Université Toulouse (Capitole / Paul Sabatier / INP)',               'Toulouse'),
    ('Université de Bordeaux',                                             'Bordeaux'),
    ('Université de Lille',                                                'Lille'),
    -- "Lorraine" is the region; Nancy holds the presidency, Metz is the other
    -- main site.
    ('Université de Lorraine',                                             'Nancy'),
    ('Université de Lyon (Lyon 1/2/3 + affiliated grandes écoles)',        'Lyon'),
    ('Université de Montpellier',                                          'Montpellier'),
    ('Université de Rouen Normandie',                                      'Rouen'),
    ('Université de Strasbourg',                                           'Strasbourg'),

    -- ---------------------------------------------------------- Germany (22)
    ('Freie Universität Berlin',                                           'Berlin'),
    ('Goethe University Frankfurt',                                        'Frankfurt am Main'),
    ('Heidelberg University',                                              'Heidelberg'),
    ('Humboldt-Universität zu Berlin',                                     'Berlin'),
    ('Karlsruhe Institute of Technology (KIT)',                            'Karlsruhe'),
    ('LMU Munich',                                                         'Munich'),
    ('RWTH Aachen University',                                             'Aachen'),
    ('Ruhr-University Bochum',                                             'Bochum'),
    ('TU Berlin',                                                          'Berlin'),
    ('TU Darmstadt',                                                       'Darmstadt'),
    ('TU Dresden',                                                         'Dresden'),
    ('Technical University of Munich (TUM)',                               'Munich'),
    ('University of Bonn',                                                 'Bonn'),
    ('University of Cologne',                                              'Cologne'),
    ('University of Freiburg',                                             'Freiburg im Breisgau'),
    ('University of Göttingen',                                            'Göttingen'),
    ('University of Hamburg',                                              'Hamburg'),
    ('University of Mannheim',                                             'Mannheim'),
    ('University of Münster',                                              'Münster'),
    ('University of Potsdam',                                              'Potsdam'),
    ('University of Stuttgart',                                            'Stuttgart'),
    ('University of Tübingen',                                             'Tübingen'),

    -- -------------------------------------------------------- Luxembourg (1)
    -- Not Luxembourg City: the university moved its main campus to Belval, in
    -- Esch-sur-Alzette, though some faculties remain in the capital.
    ('University of Luxembourg',                                           'Esch-sur-Alzette')
  ) as c(name, city)
 where u.name = c.name
   -- Gaps only, so a city somebody has corrected by hand survives and a second
   -- run changes nothing.
   and u.city is null;

-- The outcome, not the mechanism: a name mistyped above — an umlaut, the ring
-- on Åbo, the apostrophe in Côte d'Azur — leaves that university blank while
-- the statement reports success. This is what catches it.
--
-- Scoped to the five destinations this migration is about, so a university
-- added to some other country tomorrow without a city does not fail a re-run
-- of it.
do $$
declare
  missing text;
begin
  select string_agg(u.name || ' (' || d.display_name || ')', ', ' order by u.name) into missing
  from public.universities u
  join public.destinations d on d.id = u.destination_id
  where d.display_name in (
          'Austria (Public)', 'Finland (Public)', 'France (Public)',
          'Germany (Public)', 'Luxembourg (Public)')
    and (u.city is null or btrim(u.city) = '');

  if missing is not null then
    raise exception '0268: these universities still have no city: %', missing;
  end if;
end $$;
