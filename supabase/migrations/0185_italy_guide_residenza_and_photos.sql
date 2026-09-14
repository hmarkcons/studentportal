-- Two corrections the office supplied after reviewing the Italy guide.
--
--   * Four passport photographs, not the six I guessed, and the size named:
--     Italy's standard is 35 x 45 mm, and "the European format" is not
--     something a photo studio in Karachi can be expected to know.
--
--   * Registering residenza at the comune was missing. It matters for some
--     regions' scholarship payments and for getting an identity card, and it
--     is the step students most often do not know exists.
--
-- Residenza goes in "Settling in" rather than the first week on purpose: it
-- cannot be done until there is a registered rental contract in the student's
-- own name and the permesso receipt is in hand. Putting it in week one would
-- set a deadline most students physically cannot meet, and a checklist that
-- asks for the impossible stops being read.
--
-- Both guarded, so nothing the office has since edited is overwritten and
-- re-running changes nothing.

update public.travel_guide_items
set detail = 'Four, 35 × 45 mm, on a plain light background.',
    updated_at = now()
where label = 'Passport photographs'
  and detail = 'Six, in the European format. You will need them repeatedly.';

insert into public.travel_guide_items (section_id, label, detail, days_after_arrival, sort_order)
select s.id,
       'Register your residenza at the comune',
       'Your official address in Italy, registered at the town hall. Some regions will not pay a scholarship without it, and you need it for an identity card. It can only be done once your rental contract is registered in your own name and you have your permesso receipt — so if you are in university housing or sharing informally, ask your counsellor first whether you can register at all.',
       45,
       25
from public.travel_guide_sections s
join public.destinations d on d.id = s.destination_id
where lower(btrim(d.country)) = 'italy'
  and s.title = 'Settling in'
  and not exists (
    select 1 from public.travel_guide_items i
    where i.section_id = s.id and i.label = 'Register your residenza at the comune'
  );
