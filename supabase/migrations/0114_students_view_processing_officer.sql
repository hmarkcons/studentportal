-- The students view lists its columns explicitly, so processing_officer_id
-- (added in 0113) was invisible to anything reading a registered student
-- through the view rather than straight off leads.
--
-- security_invoker stays on: without it the view runs as its owner and
-- silently bypasses the RLS policies on leads (see 0065/0066).
--
-- The new column goes last: create or replace view can only append columns,
-- never insert one mid-list, and dropping the view to reorder would take its
-- grants and any dependents with it.
create or replace view students
with (security_invoker = on) as
  select
    id,
    date_of_inquiry,
    platform_source,
    full_name,
    contact_number,
    email,
    current_qualification,
    level_applying_for,
    course_of_interest,
    country_of_interest,
    assigned_counselor_id,
    status,
    created_at,
    updated_at,
    date_of_birth,
    address,
    home_phone,
    finalized_course_of_interest,
    university_applying_to,
    emergency_contact_name,
    emergency_contact_relation,
    emergency_contact_number,
    registered_at,
    auth_user_id,
    portal_active,
    campaign_id,
    registration_status,
    discount_amount,
    discount_reason,
    intake,
    processing_officer_id
  from leads
  where registered_at is not null;
