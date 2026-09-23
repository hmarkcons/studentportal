-- Which region each Italian university is in.
--
-- 26 of the 28 had none, and the two that did were wrong in an interesting
-- way: Ferrara held "Ergo" and Padova held "ESU Padova". Those are the names
-- of their regional student-aid agencies, not regions — and both already exist
-- properly in scholarship_bodies, as ER.GO against Emilia-Romagna and ESU
-- Padova against Veneto. So nothing is lost by correcting them; the agency is
-- recorded in the table that is actually about agencies.
--
-- ------------------------------------------------------- why these spellings
--
-- Lombardy, Sicily and Tuscany in English; Piemonte, Veneto, Emilia-Romagna
-- and the rest as they are in Italian. That looks inconsistent and is
-- deliberate: it is character-for-character the vocabulary already in
-- scholarship_bodies.region, and every one of the thirteen regions used below
-- belongs to a body that serves Italy.
--
-- It matters because that is the comparison a human actually makes. Nothing
-- joins these two columns — scholarship bodies attach to destinations, not to
-- universities — so matching a student at Pavia to EDiSU Pavia is somebody
-- reading "Lombardy" in one place and "Lombardy" in the other, and the
-- scholarship page's search box covers the region field. "Lombardia" against
-- "Lombardy" would quietly break that for no gain.
--
-- Note this differs from the cities in 0264, which are Italian throughout.
-- Each field follows its nearest existing precedent rather than one global
-- rule: the cities had Padova and Ferrara already set in Italian, the regions
-- have thirty-one scholarship bodies already spelled this way.
--
-- ------------------------------------------------------------ not gaps only
--
-- Unlike the cities, this writes all 28 rather than only the empty ones,
-- because two of the stored values are the thing being corrected.

update public.universities u
   set region = r.region
  from (values
    ('Alma Mater Studiorum – Università di Bologna',     'Emilia-Romagna'),
    ('Politecnico di Milano',                            'Lombardy'),
    ('Politecnico di Torino',                            'Piemonte'),
    ('Sapienza Università di Roma',                      'Lazio'),
    ('Università Ca'' Foscari Venezia',                  'Veneto'),
    ('Università degli Studi dell''Aquila',              'Abruzzo'),
    ('Università degli Studi della Campania',            'Campania'),
    ('Università degli Studi di Bergamo',                'Lombardy'),
    ('Università degli Studi di Brescia',                'Lombardy'),
    ('Università degli Studi di Catania',                'Sicily'),
    ('Università degli Studi di Ferrara',                'Emilia-Romagna'),
    ('Università degli Studi di Firenze',                'Tuscany'),
    ('Università degli Studi di Genova',                 'Liguria'),
    ('Università degli Studi di Messina',                'Sicily'),
    ('Università degli Studi di Milano (Statale)',       'Lombardy'),
    ('Università degli Studi di Milano-Bicocca',         'Lombardy'),
    ('Università degli Studi di Modena e Reggio Emilia', 'Emilia-Romagna'),
    ('Università degli Studi di Padova',                 'Veneto'),
    ('Università degli Studi di Perugia',                'Umbria'),
    ('Università degli Studi di Siena',                  'Tuscany'),
    ('Università degli Studi di Trieste',                'Friuli Venezia Giulia'),
    ('Università degli Studi di Udine',                  'Friuli Venezia Giulia'),
    ('Università degli Studi di Verona',                 'Veneto'),
    ('Università di Parma',                              'Emilia-Romagna'),
    ('Università di Pavia',                              'Lombardy'),
    ('Università di Pisa',                               'Tuscany'),
    ('Università Iuav di Venezia',                       'Veneto'),
    ('Università Politecnica delle Marche',              'Marche')
  ) as r(name, region)
 where u.name = r.name
   and u.destination_id = (select id from public.destinations where display_name = 'Italy (Public)')
   and u.region is distinct from r.region;

-- ------------------------------------------------------------- the two checks
--
-- Both ask about the outcome rather than about whether the update ran, because
-- a name mistyped above — an accent, an apostrophe, the en-dash in the Bologna
-- one — leaves that row untouched while the statement reports success.
do $$
declare
  missing text;
  unknown text;
begin
  select string_agg(u.name, ', ' order by u.name) into missing
  from public.universities u
  join public.destinations d on d.id = u.destination_id
  where d.display_name = 'Italy (Public)'
    and (u.region is null or btrim(u.region) = '');

  if missing is not null then
    raise exception '0265: these Italy universities still have no region: %', missing;
  end if;

  -- The one that earns its keep. Every region written here must be a region
  -- some scholarship body serving Italy is already filed under; if it is not,
  -- the spelling has drifted and the matching this exists for is broken —
  -- silently, since nothing joins the two columns and nothing would complain.
  select string_agg(distinct u.region, ', ') into unknown
  from public.universities u
  join public.destinations d on d.id = u.destination_id
  where d.display_name = 'Italy (Public)'
    and not exists (
      select 1
      from public.scholarship_bodies b
      join public.scholarship_body_destinations bd on bd.scholarship_body_id = b.id
      where bd.destination_id = d.id
        and b.region = u.region
    );

  if unknown is not null then
    raise exception
      '0265: no scholarship body serving Italy is filed under: % — the region spelling has drifted', unknown;
  end if;
end $$;
