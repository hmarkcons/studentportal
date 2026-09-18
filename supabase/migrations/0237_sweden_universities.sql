-- Give Sweden a university catalogue.
--
-- The last destination with none. Sweden was configured throughout — a
-- researched visa page, visa offices, pipeline stages, and a corrected
-- destination record (0228) — but with no universities nothing could be
-- applied for, so no student could reach any of it. Same blocker Ireland and
-- Romania had in 0236.
--
-- type is 'public', matching "Sweden (Public)" and the rule that holds across
-- every destination: a university carries its DESTINATION's track, not its own
-- legal ownership. See 0236 for the evidence.
--
-- That convention settles what would otherwise be a judgement call here.
-- Chalmers and the Stockholm School of Economics are foundation-owned rather
-- than state-owned, so they are absent from Sweden's official list of state
-- universities — but they charge non-EU students the same way, they are among
-- the strongest options in the country for engineering and business, and the
-- track label does not describe ownership. Leaving out Chalmers in particular
-- would be a real gap in an engineering-heavy destination.

insert into public.universities (destination_id, name, city, type)
select d.id, v.name, v.city, 'public'::destination_track
from (
  values
    -- The sixteen institutions holding full university status. Mälardalen is
    -- included: it was promoted from university college on 1 January 2022, so
    -- lists that predate that still file it under högskola.
    ('Uppsala University', 'Uppsala'),
    ('Lund University', 'Lund'),
    ('University of Gothenburg', 'Gothenburg'),
    ('Stockholm University', 'Stockholm'),
    ('Karolinska Institutet', 'Stockholm'),
    ('Umeå University', 'Umeå'),
    ('KTH Royal Institute of Technology', 'Stockholm'),
    ('Linköping University', 'Linköping'),
    ('Swedish University of Agricultural Sciences', 'Uppsala'),
    ('Luleå University of Technology', 'Luleå'),
    ('Karlstad University', 'Karlstad'),
    ('Örebro University', 'Örebro'),
    ('Mid Sweden University', 'Sundsvall'),
    ('Linnaeus University', 'Växjö'),
    ('Malmö University', 'Malmö'),
    ('Mälardalen University', 'Västerås'),
    -- Foundation-owned, not state-owned, and therefore not on the official
    -- list of Swedish state universities. Included deliberately: same fees for
    -- non-EU students, and omitting Chalmers from an engineering destination
    -- would be a hole rather than a tidy boundary.
    ('Chalmers University of Technology', 'Gothenburg'),
    ('Stockholm School of Economics', 'Stockholm'),
    -- University colleges (högskola). Limited doctoral rights, but they take
    -- international students onto English-taught programmes and are usually
    -- the more reachable option.
    ('Jönköping University', 'Jönköping'),
    ('Halmstad University', 'Halmstad'),
    ('Blekinge Institute of Technology', 'Karlskrona'),
    ('University of Borås', 'Borås'),
    ('Dalarna University', 'Falun'),
    ('University of Skövde', 'Skövde'),
    ('University West', 'Trollhättan'),
    ('Kristianstad University', 'Kristianstad'),
    ('University of Gävle', 'Gävle'),
    ('Södertörn University', 'Stockholm')
) as v(name, city)
cross join (select id from public.destinations where country_code = 'SE') d
where not exists (
  select 1 from public.universities u where u.destination_id = d.id and u.name = v.name
);
