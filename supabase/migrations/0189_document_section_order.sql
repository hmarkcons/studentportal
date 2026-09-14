-- Attestation second, scholarship documents third, on every checklist.
--
-- Most destinations already read admission → attestation → visa → …, but Italy
-- — the country most students go to — had attestation sixth and scholarship
-- documents seventh, behind the visa and travel sections. So the two sections
-- a counsellor works through first were at the bottom of the page.
--
-- Reordered rather than reassigned: a section is moved where it exists and is
-- NOT added where it does not. Eight destinations have no attestation section
-- and only Italy has scholarship documents, and adding them would silently
-- start demanding paperwork from students in countries that do not need it —
-- a different decision from the one asked for, and the office's to make in
-- Setup › Create Doc Checklist.
--
-- Renumbering is safe: the unique index is on (destination_id, section_key),
-- so sort_order has no collisions to avoid.

with ranked as (
  select
    destination_id,
    section_key,
    row_number() over (
      partition by destination_id
      order by
        case section_key
          when 'admission' then 0
          when 'attestation' then 1
          when 'scholarship_documents' then 2
          else 3
        end,
        -- Everything else keeps the relative order it already had.
        sort_order,
        section_key
    ) as position
  from public.destination_document_sections
)
update public.destination_document_sections d
set sort_order = r.position * 10
from ranked r
where d.section_key = r.section_key
  and d.destination_id is not distinct from r.destination_id;

-- The palette in Setup, so the chips are offered in the same order the
-- checklist reads in. Cosmetic — a student's section order comes from the
-- per-destination rows above — but a palette that disagrees with every
-- checklist it builds is just confusing.
update public.document_sections set sort_order = 10 where key = 'admission';
update public.document_sections set sort_order = 20 where key = 'attestation';
update public.document_sections set sort_order = 30 where key = 'scholarship_documents';
update public.document_sections set sort_order = 40 where key = 'interview';
update public.document_sections set sort_order = 50 where key = 'visa';
update public.document_sections set sort_order = 60 where key = 'italian_translations';
update public.document_sections set sort_order = 70 where key = 'visa_sticker';
update public.document_sections set sort_order = 80 where key = 'travel';
update public.document_sections set sort_order = 90 where key = 'enrollment';
update public.document_sections set sort_order = 100 where key = 'scholarship';
update public.document_sections set sort_order = 110 where key = 'other';
