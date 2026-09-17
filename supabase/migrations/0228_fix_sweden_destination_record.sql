-- Tidy Sweden's destination record: a working name, the right country code,
-- and one piece of test data removed.
--
-- Three things were wrong with it, found while building Sweden's visa page.
--
-- 1. display_name was "Sweden PB". That is customer-facing — it appears in the
--    destination picker, on agreements and on a student's own pages. The
--    convention everywhere else, and the fallback that destinations.ts itself
--    applies, is "<country> (<Public|Private>)", so Sweden becomes
--    "Sweden (Public)". Nothing in the code matches on display_name, so this is
--    a display change only.
--
-- 2. country_code was "SW". Sweden's ISO 3166-1 alpha-2 code is SE; SW is not
--    assigned to Sweden at all. It matters because country_code is the join key
--    for tracker definitions, and because anything that ever has to line up
--    with an external system will expect the real code.
--
--    The reason this needed care rather than a one-line update: there is NO
--    foreign key from tracker_definitions.country_code to
--    destinations.country_code. It is a loose join, so changing the
--    destination alone would silently orphan Sweden's tracker field and its
--    visa page would lose its progress fields with nothing to indicate why.
--    Both rows are therefore changed together here.
--
--    Checked before doing it: country_code appears in exactly three tables
--    (destinations, tracker_definitions, tracker_country_order); only
--    destinations and tracker_definitions hold an 'SW' row, tracker_country_order
--    holds none; nothing anywhere already holds 'SE', so the UNIQUE
--    (country_code, track) constraint cannot be violated; and nothing in the
--    application source hardcodes 'SW'. Sweden's 24 dependent rows — its
--    agreement templates, document sections and templates, scholarship links,
--    visa offices and visa page sections — all key on the destination's id and
--    are untouched by a code change.
--
-- 3. Two test agreement templates were attached: "NEw billo Agreement" and
--    "yadon ki baraat". Only the second is removed here.
--
--    "NEw billo Agreement" is deliberately left alone. It has a live agreement
--    against it — a registered student, status pending_signature, with a
--    generated PDF in storage. Deleting the template would take that agreement
--    with it or fail on the reference, and destroying somebody's generated
--    agreement is not part of tidying a destination record. It needs its own
--    decision, together with the student it belongs to, who also looks like
--    test data.

-- ------------------------------------------------- the code, both places
-- tracker_definitions first, so that if anything goes wrong the destination is
-- still findable by its old code rather than the other way round.
update public.tracker_definitions
set country_code = 'SE'
where country_code = 'SW';

update public.destinations
set country_code = 'SE',
    display_name = 'Sweden (Public)'
where country_code = 'SW'
  and display_name = 'Sweden PB';

-- ------------------------------------------------- the unreferenced template
-- Guarded twice: by name, and by there being no agreement pointing at it, so
-- this cannot remove something that has since been used.
delete from public.agreement_templates t
where t.id = '8848eee4-62c0-45cd-8d9d-3b678bed9b04'
  and t.name = 'yadon ki baraat'
  and not exists (select 1 from public.agreements a where a.template_id = t.id);
