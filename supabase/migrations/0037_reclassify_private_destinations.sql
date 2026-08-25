-- HMARK CRM rebuild — step 33: correct destination track classification.
-- UK/Canada/Turkey/Northern Cyprus/USA/Australia were seeded as 'public'
-- track in 0032 — the user has now clarified only Italy/Germany/Austria/
-- France/Hungary/Luxembourg/Finland have PUBLIC university systems for
-- HMARK's purposes; the rest are PRIVATE. Reclassifying both the
-- destinations and their universities, and correcting fees to the
-- confirmed private-track business rule (flat 150,000 PKR consultancy fee,
-- no admin charge — vs public track's admin charge + €1,800 consultancy
-- fee). Also adds New Zealand as a new private-track destination (named by
-- the user alongside the others, not previously seeded at all).
-- Run after 0036_fix_audit_log_pk_column.sql.

update destinations set
  track = 'private',
  display_name = replace(display_name, '(Public)', '(Private)'),
  admin_charge = 0,
  consultancy_fee = 150000,
  consultancy_fee_currency = 'PKR'
where country_code in ('UK', 'CA', 'TR', 'NC', 'US', 'AU') and track = 'public';

update universities set type = 'private'
where destination_id in (
  select id from destinations where country_code in ('UK', 'CA', 'TR', 'NC', 'US', 'AU') and track = 'private'
);

insert into destinations (country, country_code, track, display_name, currency, visa_type, admin_charge, consultancy_fee, consultancy_fee_currency) values
  ('New Zealand', 'NZ', 'private', 'New Zealand (Private)', 'NZD', 'Student visa', 0, 150000, 'PKR')
on conflict (country_code, track) do nothing;

insert into universities (destination_id, name, city, type)
select (select id from destinations where country_code = 'NZ' and track = 'private'), u.name, u.city, 'private'
from (values
  ('University of Auckland', 'Auckland'), ('University of Otago', 'Dunedin'),
  ('Victoria University of Wellington', 'Wellington'), ('University of Canterbury', 'Christchurch'),
  ('Massey University', 'Palmerston North'), ('University of Waikato', 'Hamilton'),
  ('Lincoln University', 'Lincoln'), ('Auckland University of Technology', 'Auckland')
) as u(name, city);
