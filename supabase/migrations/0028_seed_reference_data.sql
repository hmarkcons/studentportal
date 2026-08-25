-- HMARK CRM rebuild — step 24: seed real destination/university/scholarship-
-- body reference data, transcribed directly from the scope doc's per-country
-- Documentation Tracker sections (Modules N-T) — not fabricated placeholder
-- data. Sourced from `HMARK_Student_Portal_CRM_Scope_Document.pdf` sections
-- N (Italy), P (Germany, 22 universities), Q (Austria, all 22 public
-- universities), R (France, 20 universities), S (Hungary — University of
-- Pécs), T (Luxembourg — University of Luxembourg).
--
-- Scope of what's seeded here, and what's deliberately left out:
-- - destinations: all 6 countries, public track only (all six Documentation
--   Tracker sections are titled "Public University Documentation Tracker").
--   Fee figures (admin_charge/consultancy_fee) match the confirmed business
--   rule already in [[hmark_crm_new_scope]] memory (public track: €300 admin
--   charge, €450 for Germany, €1,800 consultancy fee) — not re-derived here.
-- - universities: named individually for AT/DE/FR/HU/LU, matching the doc's
--   own "Program Directory" tables for those countries. Italy has NO such
--   directory in this doc — the doc explicitly says "extends the 'All
--   Italian Universities' course directory you already maintain" (i.e. an
--   external asset HMARK holds separately, not reproduced in this doc) — so
--   Italy's universities here are instead derived from the doc's own
--   Scholarship Region & University Directory (Module N), which does name
--   real universities/cities as scholarship-body coverage. This is real
--   doc-sourced data, just narrower in scope than the other 5 countries.
-- - scholarship_bodies: Italy only (the doc has no equivalent for other
--   countries). Deadline/threshold/stipend figures from the doc's seeded
--   table were NOT transcribed — that table's rows visibly misaligned
--   during PDF text extraction (multi-line cells shifted between rows), so
--   attributing specific euro figures/dates to the wrong body would be
--   worse than leaving them blank. Left null pending the doc's own called-
--   for "AI research pass + Super Admin/Processing Officer verification"
--   workflow (not automated — matches the already-documented gap).
-- - No `programs` rows: the per-university "Notable Named Programs" columns
--   in the doc's tables suffered the same row-misalignment issue, and the
--   doc's own confidence notes say program-level detail is confirmed for
--   only a subset of universities per country anyway ("named programs
--   confirmed for 11 of 20" France universities, etc.) — seeding these
--   would risk attributing a real program to the wrong university.
--
-- Run after 0027_office_qr_attendance.sql.

insert into destinations (country, country_code, track, display_name, currency, visa_type, intake_seasons, language_requirements, admin_charge, consultancy_fee, consultancy_fee_currency) values
  ('Italy', 'IT', 'public', 'Italy (Public)', 'EUR', null, '{}', '{}'::jsonb, 300, 1800, 'EUR'),
  ('Germany', 'DE', 'public', 'Germany (Public)', 'EUR', null,
    array['Winter (October start, 15 July deadline)', 'Summer (April start, 15 January deadline)'],
    '{"german_taught": "TestDaF/DSH/Goethe/telc C1", "english_taught": "IELTS/TOEFL"}'::jsonb, 450, 1800, 'EUR'),
  ('Austria', 'AT', 'public', 'Austria (Public)', 'EUR', 'Residence Permit for Students (Aufenthaltsbewilligung Studierende)', '{}',
    '{"german_taught": "ÖSD/Goethe B2 (sometimes C1)", "english_taught": "IELTS 6.0-6.5"}'::jsonb, 300, 1800, 'EUR'),
  ('France', 'FR', 'public', 'France (Public)', 'EUR', 'Long-Stay Visa (VLS-TS)', '{}',
    '{"french_taught": "DELF/TCF B2", "english_taught": "IELTS 6.0+"}'::jsonb, 300, 1800, 'EUR'),
  ('Hungary', 'HU', 'public', 'Hungary (Public)', 'HUF', null, '{}', '{}'::jsonb, 300, 1800, 'EUR'),
  ('Luxembourg', 'LU', 'public', 'Luxembourg (Public)', 'EUR', 'Long-stay Type-D visa', array['September (Master''s single intake)'],
    '{"english_taught": "IELTS 5.5-7.0 or TOEFL 87-100", "additional": "some programs also require French/German B2"}'::jsonb, 300, 1800, 'EUR')
on conflict (country_code, track) do nothing;

-- Austria — all 22 public universities (doc: "Confidence note: all 22
-- Austrian public universities are now researched").
insert into universities (destination_id, name, type)
select (select id from destinations where country_code = 'AT' and track = 'public'), u.name, 'public'
from (values
  ('University of Vienna'), ('TU Wien'), ('WU Vienna (Vienna University of Economics and Business)'),
  ('University of Natural Resources and Life Sciences, Vienna (BOKU)'),
  ('University of Veterinary Medicine Vienna (Vetmeduni)'), ('Medical University of Vienna'),
  ('University of Graz (Karl-Franzens-Universität)'), ('TU Graz'), ('Medical University of Graz'),
  ('Johannes Kepler University Linz (JKU)'), ('University of Salzburg'), ('University of Innsbruck'),
  ('Medical University of Innsbruck'), ('Alpen-Adria University of Klagenfurt'),
  ('University for Continuing Education Krems (Danube University)'), ('Montanuniversität Leoben'),
  ('Academy of Fine Arts Vienna'), ('University of Applied Arts Vienna'),
  ('University of Music and Performing Arts Vienna (mdw)'), ('University of Music and Performing Arts Graz (KUG)'),
  ('Universität Mozarteum Salzburg'), ('University of Art and Industrial Design Linz (Kunstuniversität Linz)')
) as u(name);

-- Germany — 22 seeded universities (doc: "drawn from QS 2027 rankings and
-- each university's own English-programs pages"; outstanding ~100+ beyond
-- this list are explicitly not yet researched, per the doc).
insert into universities (destination_id, name, type)
select (select id from destinations where country_code = 'DE' and track = 'public'), u.name, 'public'
from (values
  ('Technical University of Munich (TUM)'), ('LMU Munich'), ('Heidelberg University'),
  ('RWTH Aachen University'), ('TU Berlin'), ('Freie Universität Berlin'), ('Humboldt-Universität zu Berlin'),
  ('Karlsruhe Institute of Technology (KIT)'), ('University of Bonn'), ('University of Hamburg'),
  ('TU Dresden'), ('University of Tübingen'), ('University of Freiburg'), ('University of Göttingen'),
  ('University of Münster'), ('University of Stuttgart'), ('University of Mannheim'), ('University of Cologne'),
  ('Goethe University Frankfurt'), ('TU Darmstadt'), ('Ruhr-University Bochum'), ('University of Potsdam')
) as u(name);

-- France — 20 seeded universities (doc: "all now researched"; Toulouse's
-- three institutions are kept as one entry, matching how the doc's own
-- table presents them as a single row).
insert into universities (destination_id, name, type)
select (select id from destinations where country_code = 'FR' and track = 'public'), u.name, 'public'
from (values
  ('Sorbonne Université'), ('Université Paris-Saclay'), ('Université Paris Cité'),
  ('Université PSL (Paris Sciences & Lettres)'), ('Université Paris 1 Panthéon-Sorbonne'),
  ('Université Sorbonne Nouvelle (Paris 3)'), ('Université Paris Dauphine-PSL'),
  ('Université Grenoble Alpes'), ('Université de Bordeaux'), ('Université de Strasbourg'),
  ('Université de Lille'), ('Aix-Marseille Université'),
  ('Université Toulouse (Capitole / Paul Sabatier / INP)'), ('Université de Montpellier'),
  ('Nantes Université'), ('University of Rennes'), ('Université de Lorraine'),
  ('Université Côte d''Azur'), ('Université de Rouen Normandie'),
  ('Université de Lyon (Lyon 1/2/3 + affiliated grandes écoles)')
) as u(name);

-- Hungary — the doc's tracker covers only the University of Pécs; self-
-- funded admission pathway explicitly flagged as not yet researched.
insert into universities (destination_id, name, type)
select (select id from destinations where country_code = 'HU' and track = 'public'), 'University of Pécs', 'public';

-- Luxembourg — the country has exactly one public university.
insert into universities (destination_id, name, type)
select (select id from destinations where country_code = 'LU' and track = 'public'), 'University of Luxembourg', 'public';

-- Italy — derived from the doc's Scholarship Region & University Directory
-- (Module N), not a "Program Directory" table like the other 5 countries.
-- See migration header note above.
insert into universities (destination_id, name, type)
select (select id from destinations where country_code = 'IT' and track = 'public'), u.name, 'public'
from (values
  ('Politecnico di Torino'), ('Università di Pavia'), ('Università degli Studi di Milano (Statale)'),
  ('Politecnico di Milano'), ('Università degli Studi di Milano-Bicocca'), ('Università degli Studi di Bergamo'),
  ('Università degli Studi di Brescia'), ('Alma Mater Studiorum – Università di Bologna'),
  ('Università di Parma'), ('Università degli Studi di Modena e Reggio Emilia'), ('Università degli Studi di Ferrara'),
  ('Sapienza Università di Roma'), ('Università degli Studi di Perugia'), ('Università degli Studi dell''Aquila'),
  ('Università degli Studi della Campania'), ('Università degli Studi di Firenze'), ('Università di Pisa'),
  ('Università degli Studi di Siena'), ('Università degli Studi di Padova'), ('Università Ca'' Foscari Venezia'),
  ('Università Iuav di Venezia'), ('Università degli Studi di Verona'), ('Università degli Studi di Trieste'),
  ('Università degli Studi di Udine'), ('Università Politecnica delle Marche'), ('Università degli Studi di Catania'),
  ('Università degli Studi di Messina'), ('Università degli Studi di Genova')
) as u(name);

-- Italy scholarship bodies (DSU directory), academic year 2026/2027. Named
-- explicitly in the doc; deadline/threshold/stipend figures intentionally
-- left null — see migration header note.
insert into scholarship_bodies (name, region, covers, academic_year) values
  ('EDISU Piemonte', 'Piemonte', array['Turin', 'Politecnico di Torino'], '2026/2027'),
  ('EDiSU Pavia', 'Lombardy', array['Pavia'], '2026/2027'),
  ('ADISU Umbria', 'Umbria', array['Perugia'], '2026/2027'),
  ('ER.GO', 'Emilia-Romagna', array['Bologna', 'Parma', 'Modena', 'Reggio Emilia', 'Ferrara'], '2026/2027'),
  ('DiSCo Lazio', 'Lazio', array['Rome (Sapienza)'], '2026/2027'),
  ('ESU Padova', 'Veneto', array['Padua'], '2026/2027'),
  ('ESU Venezia', 'Veneto', array['Venice (Ca''Foscari, IUAV)'], '2026/2027'),
  ('ESU Verona', 'Veneto', array['Verona'], '2026/2027'),
  ('ADiSURC', 'Campania', array['Naples / Campania'], '2026/2027'),
  ('DSU Toscana', 'Tuscany', array['Florence', 'Pisa', 'Siena'], '2026/2027'),
  ('ADSU L''Aquila', 'Abruzzo', array['L''Aquila'], '2026/2027'),
  ('ARDiS FVG', 'Friuli Venezia Giulia', array['Trieste', 'Udine'], '2026/2027'),
  ('ERDIS Marche', 'Marche', array['Ancona (Politecnica delle Marche)', 'Camerino', 'Macerata', 'Urbino'], '2026/2027'),
  ('ERSU Catania', 'Sicily', array['Catania'], '2026/2027'),
  ('ERSU Messina', 'Sicily', array['Messina'], '2026/2027'),
  ('ALiSEO Liguria', 'Liguria', array['Genoa'], '2026/2027');
