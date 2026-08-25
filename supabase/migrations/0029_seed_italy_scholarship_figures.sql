-- HMARK CRM rebuild — step 25: fill in the Italy scholarship-body deadline/
-- threshold/stipend figures deliberately left null in 0028.
--
-- 0028's caution turned out to be justified: a first attempt to reconstruct
-- this table from `pdftotext` output (both -layout and raw modes) produced
-- several genuinely wrong attributions once cross-checked against the real
-- table (e.g. DiSCo Lazio's ISEE/ISPE figures were actually ER.GO's; ERDIS
-- Marche's deadline had been misattributed to ERSU Catania) — text
-- extraction had scrambled the row alignment badly enough that hand-fixing
-- it from text alone was not reliable.
--
-- Resolved properly this time by installing Poppler (`winget install
-- oschwartz10612.Poppler`, since pdftoppm wasn't otherwise available in
-- this environment) and rendering the actual PDF pages (15-17) as images,
-- then reading the real table visually — every value below is transcribed
-- directly from that rendered table, not reconstructed from garbled text.
-- Values use "≤" where the source table shows it (an eligibility ceiling,
-- not an exact figure) and "—" is kept as-is where the source itself shows
-- no value, rather than inferring one.
--
-- Also adds 5 rows for the Milan-area + Bergamo + Brescia universities that
-- run their OWN scholarship competitions rather than going through a single
-- regional DSU body (the doc: "Lombardy has no single regional body — each
-- university runs its own scholarship competition") — the source table
-- gives them their own row with figures exactly like the 16 real DSU
-- bodies, so they're added here as scholarship_bodies rows too, distinct
-- from the destinations.universities rows for the same institutions.
--
-- Run after 0028_seed_reference_data.sql. If 0029 was already applied with
-- the earlier (partially incorrect) draft, re-running this file corrects it
-- — every UPDATE here is unconditional on name match, safe to re-run.

update scholarship_bodies set
  application_deadline = '22 Jul – 4 Sep 2026 (Bachelor''s/Master''s); 28 Oct – 27 Nov 2026 (PhD)',
  isee_threshold = 'National thresholds',
  ispe_threshold = 'National thresholds',
  stipend_amount = '€7,171 / €4,191 / €2,890',
  last_updated_year = 2026,
  source_url = 'https://www.edisu.piemonte.it'
where name = 'EDISU Piemonte';

update scholarship_bodies set
  application_deadline = '15 Sep 2026, 15:00',
  isee_threshold = 'National thresholds',
  ispe_threshold = 'National thresholds',
  stipend_amount = 'National min.',
  last_updated_year = 2026,
  source_url = 'https://www.edisu.pv.it'
where name = 'EDiSU Pavia';

update scholarship_bodies set
  application_deadline = '23 Jun – 24 Aug 2026 (new applicants); 6 Aug 2026 (renewals)',
  isee_threshold = '≤€25,000',
  ispe_threshold = '≤€50,000',
  stipend_amount = '€7,171 / €4,191 / €2,890',
  last_updated_year = 2026,
  source_url = 'https://www.er-go.it'
where name = 'ER.GO';

update scholarship_bodies set
  application_deadline = '10 Jun – 22 Jul 2026, 12:00 (1st phase)',
  ispe_threshold = '≤€61,608.48 (ISPE/ISPEUP)',
  last_updated_year = 2026,
  source_url = 'https://www.laziodisco.it'
where name = 'DiSCo Lazio';

update scholarship_bodies set
  application_deadline = '2 Sep 2026, 12:00',
  isee_threshold = '≤€28,339.88',
  ispe_threshold = '≤€61,608.48',
  last_updated_year = 2026,
  source_url = 'https://www.adisu.umbria.it'
where name = 'ADISU Umbria';

update scholarship_bodies set
  application_deadline = 'Published 24 Jul 2026; deadline 10 Sep 2026, 12:00',
  last_updated_year = 2026,
  source_url = 'https://www.adisurcampania.it'
where name = 'ADiSURC';

update scholarship_bodies set
  application_deadline = '20 Jul – 7 Sep 2026, 13:00 (Bachelor''s/Master''s); 25 Sep – 16 Nov 2026 (PhD)',
  isee_threshold = '≤€27,000',
  ispe_threshold = '≤€60,000',
  stipend_amount = 'Up to €3,150/yr housing contribution if no space available',
  last_updated_year = 2026,
  source_url = 'https://www.dsu.toscana.it'
where name = 'DSU Toscana';

update scholarship_bodies set
  application_deadline = '31 Aug 2026',
  stipend_amount = 'In sede €3,908 / pendolare €4,191 / fuori sede €7,171',
  last_updated_year = 2026,
  source_url = 'https://www.adsuaq.org'
where name = 'ADSU L''Aquila';

update scholarship_bodies set
  application_deadline = 'From ~15 Jul 2026',
  isee_threshold = '≤€28,339.88',
  ispe_threshold = '≤€61,608.48',
  benefits = '1st installment by 31 Dec 2026',
  last_updated_year = 2026,
  source_url = 'https://www.ardis.fvg.it'
where name = 'ARDiS FVG';

update scholarship_bodies set
  application_deadline = 'Bando published Jul 2026',
  isee_threshold = '≤€26,306.25 (Veneto-wide)',
  ispe_threshold = '≤€43,125.94 (Veneto-wide)',
  last_updated_year = 2026,
  source_url = 'https://www.unipd.it'
where name = 'ESU Padova';

update scholarship_bodies set
  application_deadline = 'Bando published; check portal for exact date',
  isee_threshold = '≤€26,306.25',
  ispe_threshold = '≤€43,125.94',
  benefits = '1st installment by 31 Dec 2026',
  last_updated_year = 2026,
  source_url = 'https://www.esuvenezia.it'
where name = 'ESU Venezia';

update scholarship_bodies set
  application_deadline = '3 Aug – 30 Sep 2026, 12:00',
  isee_threshold = 'Per bando art. 3',
  ispe_threshold = 'Per bando art. 3',
  last_updated_year = 2026,
  source_url = 'https://www.esu.vr.it'
where name = 'ESU Verona';

update scholarship_bodies set
  application_deadline = '14 Jul – 28 Aug 2026',
  last_updated_year = 2026,
  source_url = 'https://www.erdis.it'
where name = 'ERDIS Marche';

update scholarship_bodies set
  application_deadline = '24 Jun – 10 Aug 2026, 14:00',
  last_updated_year = 2026,
  source_url = 'https://www.ersucatania.it'
where name = 'ERSU Catania';

-- The source table itself hedges this one ("main deadline not fully
-- confirmed") — kept verbatim rather than smoothed into a firm date.
update scholarship_bodies set
  application_deadline = 'Confirmation/appeals window ~4–16 Sep 2026 (main deadline not fully confirmed)',
  last_updated_year = 2026,
  source_url = 'https://www.ersumessina.it'
where name = 'ERSU Messina';

update scholarship_bodies set
  application_deadline = 'Closed for AY 26/27 — was 15 Jun – 31 Jul 2026, 12:00',
  isee_threshold = '≤€28,339',
  ispe_threshold = '≤€61,608',
  stipend_amount = 'Up to €7,172 (off-campus) / €2,891 min (on-campus)',
  last_updated_year = 2026,
  source_url = 'https://www.aliseo.liguria.it'
where name = 'ALiSEO Liguria';

-- New rows: Milan-area + Bergamo + Brescia universities running their own
-- scholarship competitions (no single Lombardy DSU body). Remove any prior
-- draft rows for these names first, in case this migration is being re-run
-- after the earlier, less-accurate version.
delete from scholarship_bodies where name in (
  'Università degli Studi di Milano (Statale)', 'Politecnico di Milano',
  'Università degli Studi di Milano-Bicocca', 'Università degli Studi di Bergamo',
  'Università degli Studi di Brescia'
);

insert into scholarship_bodies (name, region, covers, academic_year, application_deadline, isee_threshold, ispe_threshold, stipend_amount, last_updated_year, source_url) values
  ('Università degli Studi di Milano (Statale)', 'Lombardy', array['Milan'], '2026/2027',
    '30 Sep 2026', null, null, '1,055 university-funded scholarships, €1,800 each (on top of any DSU award)', 2026, 'https://www.unimi.it'),
  ('Politecnico di Milano', 'Lombardy', array['Milan'], '2026/2027',
    '21 Jul 2026 (continuing students); 5 Aug 2026 (new/first-year)', null, null, null, 2026, 'https://www.polimi.it'),
  ('Università degli Studi di Milano-Bicocca', 'Lombardy', array['Milan'], '2026/2027',
    'From 7 Jul 2026', '≤€26,516.70 (prior-year figure)', '≤€57,645.03 (prior-year figure)',
    'Up to €8,606.40 (STEM, off-campus women)', 2026, 'https://www.unimib.it'),
  ('Università degli Studi di Bergamo', 'Lombardy', array['Bergamo'], '2026/2027',
    '3 Sep 2026 (housing); 5 Oct 2026 (scholarship)', null, '≤€58,452.06',
    '800 scholarships (250 first-year / 550 continuing)', 2026, 'https://www.unibg.it'),
  ('Università degli Studi di Brescia', 'Lombardy', array['Brescia'], '2026/2027',
    'Published, AY 26/27', null, '≤€58,452.06', null, 2026, 'https://www.studenti.it');
