-- HMARK CRM rebuild — step 35: restrict editing/deleting destinations,
-- universities, and programs to Super Admin only (creation stays open to
-- any active staff, matching current behavior — the user only asked to
-- restrict edit/delete). Splits the single "for all" policy into
-- insert/update/delete so each can have its own role check.
-- Run after 0038_program_academic_requirement.sql.

drop policy if exists "destinations_write" on destinations;
create policy "destinations_insert" on destinations for insert with check (is_active_staff());
create policy "destinations_update" on destinations for update
  using (has_role(array['super_admin']::staff_role[])) with check (has_role(array['super_admin']::staff_role[]));
create policy "destinations_delete" on destinations for delete
  using (has_role(array['super_admin']::staff_role[]));

drop policy if exists "universities_write" on universities;
create policy "universities_insert" on universities for insert with check (is_active_staff());
create policy "universities_update" on universities for update
  using (has_role(array['super_admin']::staff_role[])) with check (has_role(array['super_admin']::staff_role[]));
create policy "universities_delete" on universities for delete
  using (has_role(array['super_admin']::staff_role[]));

drop policy if exists "programs_write" on programs;
create policy "programs_insert" on programs for insert with check (is_active_staff());
create policy "programs_update" on programs for update
  using (has_role(array['super_admin']::staff_role[])) with check (has_role(array['super_admin']::staff_role[]));
create policy "programs_delete" on programs for delete
  using (has_role(array['super_admin']::staff_role[]));
