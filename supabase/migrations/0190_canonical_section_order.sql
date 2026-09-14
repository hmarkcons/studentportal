-- One canonical section order, so a student's checklist cannot be scrambled by
-- which countries they happen to be registered for.
--
-- 0189 renumbered each destination's sections 10, 20, 30… within itself. That
-- looked right on every Setup screen and was wrong on every student's page,
-- because loadStudentChecklistSections takes the EARLIEST position each
-- section holds across all of the student's destinations plus the shared
-- All-destinations list — and two lists numbered independently from 10 are not
-- comparable. For an Italy student it put the visa section level with
-- attestation and pushed scholarship documents to fourth:
--
--   Italy:  admission 10, attestation 20, scholarship 30, visa 40 …
--   Shared: admission 10, visa 20, visa_sticker 30 …
--   min():  admission 10, attestation 20, visa 20, scholarship 30 …
--
-- So position now comes from the section itself rather than from its place
-- within one list. Every destination agrees on the number for a given section,
-- the minimum across any combination of destinations is that same number, and
-- a student registered for one country or four sees the same order.
--
-- Staff can still reorder a destination's sections in Setup — that writes new
-- numbers, as before. It just no longer starts from a state where two
-- countries disagree by construction.

update public.destination_document_sections s
set sort_order = c.position
from (
  values
    ('admission', 10),
    ('attestation', 20),
    ('scholarship_documents', 30),
    ('interview', 40),
    ('visa', 50),
    ('italian_translations', 60),
    ('visa_sticker', 70),
    ('travel', 80),
    ('enrollment', 90),
    ('scholarship', 100),
    ('other', 110)
) as c(section_key, position)
where s.section_key = c.section_key;

-- Anything not in that list — a section the office created itself — keeps its
-- relative order and sits after the known ones rather than jumping to the top.
with extras as (
  select
    destination_id,
    section_key,
    200 + row_number() over (partition by destination_id order by sort_order, section_key) * 10 as position
  from public.destination_document_sections
  where section_key not in (
    'admission', 'attestation', 'scholarship_documents', 'interview', 'visa',
    'italian_translations', 'visa_sticker', 'travel', 'enrollment', 'scholarship', 'other'
  )
)
update public.destination_document_sections d
set sort_order = e.position
from extras e
where d.section_key = e.section_key
  and d.destination_id is not distinct from e.destination_id;
