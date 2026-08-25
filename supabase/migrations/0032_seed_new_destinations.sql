-- HMARK CRM rebuild — step 28: seed 6 new destination countries (UK,
-- Australia, Canada, USA, Turkey, Northern Cyprus) and their universities.
--
-- None of these are covered by the scope doc's Documentation Tracker
-- sections (only Italy/Germany/Austria/France/Hungary/Luxembourg were
-- researched there) — same situation as Finland in 0030. University lists
-- are sourced from general/public knowledge of each country's well-known
-- universities, not the scope PDF. Visa type names are included only where
-- they're basic, unambiguous, widely-known facts (e.g. "F-1" for the US) —
-- not researched country-specific figures like the Italy scholarship data.
--
-- Fees follow the same default public-track rule as every other seeded
-- destination (€300 admin charge, €1,800 consultancy fee — no country-
-- specific override exists for any of these six, same as Hungary/
-- Luxembourg/Finland). Local destination currency is each country's real
-- currency (distinct from the EUR-denominated consultancy fee).
--
-- Scope, same restraint as every prior seed: university NAME + CITY only,
-- track='public'. No programs seeded (that's what the new CSV import
-- feature, added in this same migration set, is for) and no attempt at
-- exhaustive coverage — a representative set of well-known universities per
-- country, not "all" universities (the US alone has thousands).
--
-- Run after 0031_university_city_region_and_import.sql.

insert into destinations (country, country_code, track, display_name, currency, visa_type, admin_charge, consultancy_fee, consultancy_fee_currency) values
  ('United Kingdom', 'UK', 'public', 'United Kingdom (Public)', 'GBP', 'Student visa (formerly Tier 4)', 300, 1800, 'EUR'),
  ('Australia', 'AU', 'public', 'Australia (Public)', 'AUD', 'Student visa (subclass 500)', 300, 1800, 'EUR'),
  ('Canada', 'CA', 'public', 'Canada (Public)', 'CAD', 'Study Permit', 300, 1800, 'EUR'),
  ('United States', 'US', 'public', 'United States (Public)', 'USD', 'F-1 Student Visa', 300, 1800, 'EUR'),
  ('Turkey', 'TR', 'public', 'Turkey (Public)', 'TRY', null, 300, 1800, 'EUR'),
  ('Northern Cyprus', 'NC', 'public', 'Northern Cyprus (Public)', 'TRY', null, 300, 1800, 'EUR')
on conflict (country_code, track) do nothing;

insert into universities (destination_id, name, city, type)
select (select id from destinations where country_code = 'UK' and track = 'public'), u.name, u.city, 'public'
from (values
  ('University of Oxford', 'Oxford'), ('University of Cambridge', 'Cambridge'),
  ('Imperial College London', 'London'), ('University College London', 'London'),
  ('London School of Economics and Political Science', 'London'), ('King''s College London', 'London'),
  ('University of Edinburgh', 'Edinburgh'), ('University of Manchester', 'Manchester'),
  ('University of Bristol', 'Bristol'), ('University of Warwick', 'Coventry'),
  ('University of Glasgow', 'Glasgow'), ('University of Birmingham', 'Birmingham'),
  ('University of Leeds', 'Leeds'), ('University of Sheffield', 'Sheffield'),
  ('University of Southampton', 'Southampton'), ('University of Nottingham', 'Nottingham'),
  ('Queen Mary University of London', 'London'), ('University of York', 'York'),
  ('Cardiff University', 'Cardiff'), ('Newcastle University', 'Newcastle upon Tyne'),
  ('Lancaster University', 'Lancaster'), ('University of Liverpool', 'Liverpool'),
  ('Coventry University', 'Coventry'), ('University of Hertfordshire', 'Hatfield'),
  ('Ulster University', 'Belfast')
) as u(name, city);

insert into universities (destination_id, name, city, type)
select (select id from destinations where country_code = 'AU' and track = 'public'), u.name, u.city, 'public'
from (values
  ('University of Melbourne', 'Melbourne'), ('University of Sydney', 'Sydney'),
  ('Australian National University', 'Canberra'), ('University of Queensland', 'Brisbane'),
  ('Monash University', 'Melbourne'), ('University of New South Wales', 'Sydney'),
  ('University of Western Australia', 'Perth'), ('University of Adelaide', 'Adelaide'),
  ('University of Technology Sydney', 'Sydney'), ('RMIT University', 'Melbourne'),
  ('Macquarie University', 'Sydney'), ('Deakin University', 'Melbourne'),
  ('Griffith University', 'Brisbane'), ('Queensland University of Technology', 'Brisbane'),
  ('Curtin University', 'Perth'), ('La Trobe University', 'Melbourne'),
  ('University of Wollongong', 'Wollongong'), ('University of Newcastle', 'Newcastle'),
  ('Flinders University', 'Adelaide'), ('Western Sydney University', 'Sydney')
) as u(name, city);

insert into universities (destination_id, name, city, type)
select (select id from destinations where country_code = 'CA' and track = 'public'), u.name, u.city, 'public'
from (values
  ('University of Toronto', 'Toronto'), ('University of British Columbia', 'Vancouver'),
  ('McGill University', 'Montreal'), ('University of Alberta', 'Edmonton'),
  ('University of Waterloo', 'Waterloo'), ('McMaster University', 'Hamilton'),
  ('Western University', 'London, Ontario'), ('Queen''s University', 'Kingston'),
  ('University of Calgary', 'Calgary'), ('University of Ottawa', 'Ottawa'),
  ('Simon Fraser University', 'Burnaby'), ('York University', 'Toronto'),
  ('Concordia University', 'Montreal'), ('Dalhousie University', 'Halifax'),
  ('University of Manitoba', 'Winnipeg'), ('Carleton University', 'Ottawa'),
  ('Toronto Metropolitan University', 'Toronto'), ('University of Victoria', 'Victoria'),
  ('University of Saskatchewan', 'Saskatoon'), ('Memorial University of Newfoundland', 'St. John''s')
) as u(name, city);

insert into universities (destination_id, name, city, type)
select (select id from destinations where country_code = 'US' and track = 'public'), u.name, u.city, 'public'
from (values
  ('Harvard University', 'Cambridge, MA'), ('Massachusetts Institute of Technology', 'Cambridge, MA'),
  ('Stanford University', 'Stanford, CA'), ('Yale University', 'New Haven, CT'),
  ('Princeton University', 'Princeton, NJ'), ('Columbia University', 'New York, NY'),
  ('University of Pennsylvania', 'Philadelphia, PA'), ('Cornell University', 'Ithaca, NY'),
  ('University of Chicago', 'Chicago, IL'), ('Northwestern University', 'Evanston, IL'),
  ('Duke University', 'Durham, NC'), ('University of California, Berkeley', 'Berkeley, CA'),
  ('University of California, Los Angeles', 'Los Angeles, CA'), ('University of Michigan', 'Ann Arbor, MI'),
  ('New York University', 'New York, NY'), ('University of Southern California', 'Los Angeles, CA'),
  ('Carnegie Mellon University', 'Pittsburgh, PA'), ('University of Texas at Austin', 'Austin, TX'),
  ('University of Illinois Urbana-Champaign', 'Urbana-Champaign, IL'), ('Purdue University', 'West Lafayette, IN'),
  ('Arizona State University', 'Tempe, AZ'), ('Texas A&M University', 'College Station, TX'),
  ('Pennsylvania State University', 'University Park, PA'), ('Ohio State University', 'Columbus, OH'),
  ('University of Washington', 'Seattle, WA')
) as u(name, city);

insert into universities (destination_id, name, city, type)
select (select id from destinations where country_code = 'TR' and track = 'public'), u.name, u.city, 'public'
from (values
  ('Boğaziçi University', 'Istanbul'), ('Middle East Technical University (METU)', 'Ankara'),
  ('Istanbul Technical University', 'Istanbul'), ('Koç University', 'Istanbul'),
  ('Sabancı University', 'Istanbul'), ('Bilkent University', 'Ankara'),
  ('Istanbul University', 'Istanbul'), ('Ankara University', 'Ankara'),
  ('Hacettepe University', 'Ankara'), ('Ege University', 'Izmir'),
  ('Marmara University', 'Istanbul'), ('Yıldız Technical University', 'Istanbul'),
  ('Gazi University', 'Ankara'), ('Dokuz Eylül University', 'Izmir'),
  ('Anadolu University', 'Eskişehir')
) as u(name, city);

insert into universities (destination_id, name, city, type)
select (select id from destinations where country_code = 'NC' and track = 'public'), u.name, u.city, 'public'
from (values
  ('Eastern Mediterranean University', 'Famagusta'), ('Near East University', 'Nicosia'),
  ('Cyprus International University', 'Nicosia'), ('Girne American University', 'Kyrenia'),
  ('European University of Lefke', 'Lefke'), ('University of Kyrenia', 'Kyrenia'),
  ('Final International University', 'Kyrenia'), ('Middle East Technical University Northern Cyprus Campus', 'Güzelyurt')
) as u(name, city);
