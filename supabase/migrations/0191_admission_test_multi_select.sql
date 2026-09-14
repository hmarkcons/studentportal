-- More than one admission test per student.
--
-- Italy's "Admission test" was a single select — IMAT, TOLC, CEnT-S, SAT,
-- Other — and a student sitting more than one, which is common for anyone
-- applying to both a medical course and an engineering one, could only have
-- one of them recorded.
--
-- multi_select is already a supported field type with a working checkbox
-- control, so this is a change of type rather than new machinery.
--
-- The existing answers have to come with it. A single select stored its value
-- unquoted — "CEnT-S" — while a multi_select stores JSON — ["CEnT-S"] — so
-- without converting them the one student who had a test recorded would find
-- the field blank, and the next save would overwrite it with an empty list.

update public.tracker_definitions
set field_type = 'multi_select',
    label = 'Admission tests',
    updated_at = now()
where country_code = 'IT'
  and field_key = 'test_status'
  and field_type = 'select';

-- "CEnT-S" -> ["CEnT-S"]. Only values that are not already JSON: a row
-- holding "[]" or ["IMAT"] is left exactly as it is, so re-running this
-- changes nothing.
update public.application_country_extra
set field_value = jsonb_build_array(btrim(field_value))::text,
    updated_at = now()
where field_key = 'test_status'
  and coalesce(btrim(field_value), '') <> ''
  and btrim(field_value) not like '[%';

-- Anything that was blank becomes an explicit empty list, so every row for
-- this field now holds the same shape and nothing has to guess.
update public.application_country_extra
set field_value = '[]',
    updated_at = now()
where field_key = 'test_status'
  and coalesce(btrim(field_value), '') = '';
