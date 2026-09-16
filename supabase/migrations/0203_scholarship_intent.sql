-- "Are we applying for a scholarship for this country?"
--
-- Italy is the exception and stays one: its regional DSU is offered to every
-- Pakistani student, and the body is decided by the region the finalised
-- university sits in. Nobody needs to be asked.
--
-- Everywhere else a scholarship is a deliberate, merit-based decision that
-- somebody has to take, and the Scholarship tab was quietly implying otherwise
-- by listing every body a country has as though an application were under way.
-- This adds the question to the documentation tracker, where the rest of the
-- per-country decisions already live.
--
-- Three answers, not two. "Not decided" is the honest default and has to be
-- distinguishable from "No": a tab that hides itself because nobody has
-- looked yet is indistinguishable from one that hides itself because the
-- answer was no, and only one of those is finished.
insert into public.tracker_definitions (
  country_code, field_key, label, field_type, options, sort_order,
  show_on_student_visa, visa_role, is_appointment, is_finalized_university
)
select
  d.country_code,
  'scholarship_intent',
  'Applying for a scholarship?',
  'select',
  '["Not decided", "Yes", "No"]'::jsonb,
  -- Near the top: it decides whether a whole tab is worth opening, so it
  -- should not be buried under the visa fields.
  5,
  false, null, false, false
from (select distinct country_code from public.destinations where scholarship_access = 'selective') d
on conflict do nothing;

-- A tracker_definitions row is unique on (country_code, field_key) in
-- practice but not by constraint, so make sure re-running has not duplicated
-- anything. Keeps the oldest of any pair.
delete from public.tracker_definitions t
using public.tracker_definitions keep
where t.field_key = 'scholarship_intent'
  and keep.field_key = 'scholarship_intent'
  and t.country_code = keep.country_code
  and t.id > keep.id;
