-- restrict_student_lead_self_update() (0022) blocks a student from
-- self-editing case/registration fields on their own `leads` row, but its
-- column blocklist was never revisited after 0040_leads_applications_
-- restructure.sql added registration_status, discount_amount, and
-- discount_reason to `leads` — same "list went stale after a later
-- migration" shape as the historical 0024/0035/0036 fixes, just in a
-- trigger's blocklist instead of a role list. The app's own
-- updatePersonalDetails never sends these fields, so the normal UI can't
-- trigger it, but leads_update_self RLS only checks row ownership — a
-- direct authenticated REST call could set registration_status to
-- 'withdrawn'/'ghost' or fabricate a discount on the student's own record.

create or replace function restrict_student_lead_self_update() returns trigger
language plpgsql as $$
begin
  if old.auth_user_id = auth.uid() and not is_active_staff() then
    if new.status is distinct from old.status
      or new.registered_at is distinct from old.registered_at
      or new.portal_active is distinct from old.portal_active
      or new.assigned_counselor_id is distinct from old.assigned_counselor_id
      or new.auth_user_id is distinct from old.auth_user_id
      or new.campaign_id is distinct from old.campaign_id
      or new.date_of_inquiry is distinct from old.date_of_inquiry
      or new.platform_source is distinct from old.platform_source
      or new.registration_status is distinct from old.registration_status
      or new.discount_amount is distinct from old.discount_amount
      or new.discount_reason is distinct from old.discount_reason
    then
      raise exception 'Students may only edit their own personal details, not case/registration fields';
    end if;
  end if;
  return new;
end;
$$;
