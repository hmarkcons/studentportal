-- HMARK CRM rebuild — step 18: bug fix found during end-to-end testing.
-- Every student-facing page reads the `students` view (a view over `leads`)
-- filtered by auth_user_id = auth.uid(), but `leads` itself never had a
-- policy granting the student that access — only staff-scoped policies
-- existed. This silently returned nothing for every real student login.
-- Run after 0021_partner_applications_deadline.sql.

create policy "leads_select_self" on leads for select
  using (auth_user_id = auth.uid());

-- Per the doc: "Students can edit their own personal details directly (no
-- staff approval required)" — but core CRM fields (status, registration,
-- portal gate, counselor assignment, etc.) must stay staff-only. RLS alone
-- can't restrict columns, so a trigger guards which columns a student's own
-- update is allowed to touch.
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
    then
      raise exception 'Students may only edit their own personal details, not case/registration fields';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_restrict_student_lead_self_update on leads;
create trigger trg_restrict_student_lead_self_update
  before update on leads
  for each row execute function restrict_student_lead_self_update();

create policy "leads_update_self" on leads for update
  using (auth_user_id = auth.uid())
  with check (auth_user_id = auth.uid());
