-- Portal logins have their own section on the student's dashboard, so asking
-- for them again inside the documentation tracker meant two places to look and
-- two places to keep current.
--
-- Only the tracker's pointer to them is removed. The credentials themselves
-- live in encrypted_credentials and are untouched: the five fields dropped
-- here are all Italy's, and application_country_extra holds no values for any
-- of them (checked before writing this), because a credential field never
-- stored its value there in the first place.

delete from tracker_definitions where field_type = 'credential';

-- Stop the type being offered again when staff build the remaining countries'
-- trackers, so this cannot quietly come back.
alter table tracker_definitions
  drop constraint if exists tracker_definitions_field_type_check;

alter table tracker_definitions
  add constraint tracker_definitions_field_type_check
  check (field_type in (
    'text', 'textarea', 'number', 'date', 'boolean',
    'select', 'multi_select', 'multi_text', 'multi_university_status'
  ));
