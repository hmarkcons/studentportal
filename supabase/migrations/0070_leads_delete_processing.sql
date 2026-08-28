-- Let processing staff delete any lead/student record, matching the app's
-- delete workflow (previously management/super_admin only via RLS, and
-- super_admin only at the app level in deleteStudent()).
drop policy if exists "leads_delete" on leads;
create policy "leads_delete" on leads for delete
  using (has_role(array['management', 'super_admin', 'processing']::staff_role[]));
