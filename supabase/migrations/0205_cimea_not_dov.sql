-- HMARK uses CIMEA, not the consulate's dichiarazione di valore.
--
-- Italy accepts either a CIMEA statement of comparability or a DoV issued by
-- the consulate for the same purpose, and the office has settled on CIMEA.
-- Two places still said otherwise, or said nothing:
--
--   1. The travel guide told a student to carry "the declaration of value if
--      you have it", which reads as an optional extra of a document they
--      should not be buying at all.
--
--   2. The tracker has followed CIMEA status since it was built
--      (cimea_status, cimea_apply_category), but the document checklist had
--      no CIMEA item — so there was a process to manage and nowhere to put
--      the statement when it arrived.

-- ------------------------------------------------------- the travel guide
-- Guarded on the exact seeded wording from 0179, so re-running this cannot
-- overwrite something somebody has since edited by hand.
update public.travel_guide_items
set detail = 'Degree, transcripts, and your CIMEA statement of comparability. HMARK uses CIMEA, not the consulate''s dichiarazione di valore — do not pay for a DoV.'
where label = 'Academic documents, legalised and translated'
  and detail = 'Degree, transcripts, and the declaration of value if you have it.';

-- ------------------------------------------------------ the checklist item
-- Required, because Italian enrolment genuinely requires one or the other and
-- the office has chosen this one. It appears on every Italian student's
-- checklist from now on; flip required to false if it should be case by case.
insert into public.document_templates (destination_id, category, level, name, description, required, sort_order)
select
  d.id,
  'attestation',
  'all',
  'CIMEA statement of comparability',
  'Obtained from CIMEA online, not from the consulate. HMARK uses CIMEA rather than a dichiarazione di valore — a student should not be sent to the consulate for a DoV. Track where it has got to with "CIMEA status" on the documentation tracker.',
  true,
  -- After the apostille, which has to happen before CIMEA will look at the
  -- documents at all.
  75
from public.destinations d
where d.country_code = 'IT'
  and not exists (
    select 1 from public.document_templates t
    where t.destination_id = d.id and t.name = 'CIMEA statement of comparability'
  );
