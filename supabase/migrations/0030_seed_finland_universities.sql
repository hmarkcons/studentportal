-- HMARK CRM rebuild — step 26: seed Finland's public universities.
--
-- Unlike the six countries seeded in 0028 (Italy/Germany/Austria/France/
-- Hungary/Luxembourg), Finland has NO Documentation Tracker section in the
-- scope doc — it isn't one of the modules N-T researched there. The
-- "Finland (Public)" destination itself was created live in the app (not
-- by any migration), separately from this seeding work.
--
-- So this list is sourced differently from the other six: it's Finland's
-- standard, small, well-established set of public universities (as
-- classified by the Finnish Ministry of Education — distinct from the
-- country's separate "universities of applied sciences" category), not
-- transcribed from the HMARK scope doc. Flagging this explicitly since
-- every other seed in this project so far has been doc-sourced.
--
-- No per-university program/fee/language detail is seeded here, same as
-- the doc-sourced countries — that would need the same kind of dedicated
-- research pass the doc itself calls for before being trusted
-- operationally.
--
-- Run after 0029_seed_italy_scholarship_figures.sql.

insert into universities (destination_id, name, type)
select (select id from destinations where country_code = 'FN' and track = 'public'), u.name, 'public'
from (values
  ('University of Helsinki'),
  ('Aalto University'),
  ('University of Turku'),
  ('Tampere University'),
  ('University of Oulu'),
  ('University of Jyväskylä'),
  ('University of Eastern Finland'),
  ('LUT University (Lappeenranta-Lahti University of Technology)'),
  ('Åbo Akademi University'),
  ('University of Vaasa'),
  ('University of Lapland'),
  ('Hanken School of Economics'),
  ('University of the Arts Helsinki')
) as u(name)
where not exists (
  select 1 from universities existing
  where existing.destination_id = (select id from destinations where country_code = 'FN' and track = 'public')
    and existing.name = u.name
);
