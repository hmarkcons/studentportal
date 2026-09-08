-- Give every built-out country a place to record the visa decision, and a
-- place to record a refusal reason.
--
-- The student Visa tab reads the decision from whichever field a country marks
-- with visa_role 'outcome', and the congratulation / sympathy message is what
-- that decision drives. Only France, Hungary and Luxembourg had such a field.
-- Italy — the country actually built out, with 19 tracker fields and four of
-- them already shown on the Visa tab — had nowhere to record whether the visa
-- was granted, so an Italian student's page could only ever read "In progress"
-- and neither message could ever appear.
--
-- Likewise visa_role 'outcome_reason', which the tab shows beneath a refusal:
-- no country had one, so the reason line was unreachable code.
--
-- Additive only. Existing fields, values and orderings are untouched, and a
-- country that already has an outcome field keeps it.

-- 1. A visa decision for every country that has tracker fields but no outcome.
--    A select rather than free text: readVisaDecision matches on vocabulary,
--    and a fixed list keeps a typo from silently reading as "pending" — or
--    worse, congratulating a student whose visa was refused.
insert into tracker_definitions
  (country_code, field_key, label, field_type, options, sort_order, show_on_student_visa, visa_role)
select d.country_code,
       'visa_status',
       'Visa decision',
       'select',
       '["Pending", "Approved", "Refused"]'::jsonb,
       coalesce(max(t.sort_order), 0) + 1,
       true,
       'outcome'
  from (select distinct country_code from tracker_definitions where country_code <> 'TEST') d
  left join tracker_definitions t on t.country_code = d.country_code
 where not exists (
   select 1 from tracker_definitions x
    where x.country_code = d.country_code and x.visa_role = 'outcome'
 )
 group by d.country_code;

-- 2. The refusal reason, for every country that now has an outcome field.
--    Shown to the student only on a refusal, so they are told what went wrong
--    rather than left to ask.
insert into tracker_definitions
  (country_code, field_key, label, field_type, sort_order, show_on_student_visa, visa_role)
select d.country_code,
       'visa_refusal_reason',
       'Visa refusal reason (shown to the student)',
       'textarea',
       coalesce(max(t.sort_order), 0) + 2,
       true,
       'outcome_reason'
  from (
    select distinct country_code
      from tracker_definitions
     where visa_role = 'outcome' and country_code <> 'TEST'
  ) d
  left join tracker_definitions t on t.country_code = d.country_code
 where not exists (
   select 1 from tracker_definitions x
    where x.country_code = d.country_code and x.visa_role = 'outcome_reason'
 )
 group by d.country_code;
