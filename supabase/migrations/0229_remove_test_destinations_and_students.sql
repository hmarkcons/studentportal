-- Remove the two test destinations, the two test students behind them, and
-- three test agreement templates sitting on real destinations.
--
-- Gotham City and Nimco Land were active destinations, so they appeared in
-- every destination picker. Nimco Land also held the country code NL — the
-- Netherlands' real ISO code — which would have collided the moment a
-- Netherlands destination was added.
--
-- Deleting them alone was not possible, and not safe:
--
--   * agreements.template_id is ON DELETE NO ACTION. Deleting a destination
--     cascades to its agreement templates, and three of those had agreements
--     against them, so the cascade would have hit that constraint and the whole
--     statement would have errored.
--
--   * lead_destinations cascades. Two REGISTERED students were attached —
--     Superman (Gotham City) and Captain America (Nimco Land) — so a
--     destination-only delete would have left two registered students with no
--     destination at all, which is far harder to notice later than a test
--     destination in a dropdown.
--
-- Both are unambiguously test data: gothamcity@batman.com and
-- avengers@marvel.com, telephone "911", no login, portal inactive. Removing
-- them is what actually clears the destinations, and it was confirmed before
-- doing it.
--
-- Order matters and is driven by the constraints. Everything that references
-- leads is ON DELETE CASCADE — agreements, student_documents,
-- lead_destinations, student_cycles, staff_reassignment_log — so deleting the
-- students first removes the agreements that were blocking the template
-- deletes. Only then can the templates go, and only then the destinations.
--
-- The six generated agreement PDFs these students owned were removed from the
-- documents bucket separately, before this ran: storage is not reachable from
-- SQL, and once these rows are gone there is nothing left to discover the
-- paths from.

-- ------------------------------------------------------------- 1. the students
-- Cascades 6 agreements, 58 student_documents, 2 lead_destinations,
-- 2 student_cycles and 2 staff_reassignment_log rows.
--
-- Guarded on the name as well as the id, so this can never reach a real
-- student even if the ids were somehow wrong.
delete from public.leads
where id in (
    '442fbebc-3b08-4828-be15-5d080f84318e',  -- Superman
    '7f9da342-8940-41d8-8ffe-febf70d41f40'   -- Captain America
  )
  and full_name in ('Superman', 'Captain America');

-- ------------------------------ 2. test templates on REAL destinations
-- These three were only deletable once Superman's agreements went with him.
-- Guarded on name, on the destination they sit on, and on there being no
-- agreement left pointing at them — so if anything has since used one, it
-- stays.
delete from public.agreement_templates t
where t.id in (
    '06d9a101-2e44-4a5a-a42a-11322f0f5e38',  -- "NEw billo Agreement" (Sweden)
    '90ab03e8-0438-4621-be4a-da878d6df2b5',  -- "New 1 Agreement" (Romania)
    'e06c3292-6e52-4496-97c8-7922c8e82abe'   -- "Finish him" (Finland)
  )
  and t.name in ('NEw billo Agreement', 'New 1 Agreement', 'Finish him')
  and not exists (select 1 from public.agreements a where a.template_id = t.id);

-- ------------------------------------------- 3. the loose tracker definitions
-- tracker_definitions joins destinations by country_code with no foreign key,
-- so these would survive the destination delete as unreachable rows. Same trap
-- as Sweden's code change in 0228.
delete from public.tracker_definitions
where country_code in ('GC', 'NL');

-- ------------------------------------------------------- 4. the destinations
-- Cascades their 4 agreement templates (now unreferenced) and their 10
-- destination_document_sections.
delete from public.destinations
where country_code in ('GC', 'NL')
  and display_name in ('Gotham City', 'Nimco Land');
