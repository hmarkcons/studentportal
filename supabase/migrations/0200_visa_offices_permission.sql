-- Who maintains the embassy and visa-centre directory.
--
-- Its own key rather than a general settings one, matching how the other
-- Setup directories are gated. Management as well as Super Admin: an address
-- that has moved is the kind of correction that should not wait for one
-- person to be free.
insert into public.permission_definitions (key, category, label, description, default_roles, sort_order)
values (
  'settings.visa_offices',
  'Setup',
  'Edit the embassy and visa centre directory',
  'Add and correct the embassies, consulates and visa application centres shown on a student''s Visa page.',
  '{management,super_admin}',
  (select coalesce(max(sort_order), 0) + 10 from public.permission_definitions)
)
on conflict (key) do update
  set category = excluded.category,
      label = excluded.label,
      description = excluded.description;

-- 0199 restricted writes to a super admin alone. Widen it to match the
-- permission just defined, so the app layer and the database agree about who
-- may correct an address.
drop policy if exists "visa_offices_write" on public.visa_offices;
create policy "visa_offices_write" on public.visa_offices
  for all
  using (has_role(array['management', 'super_admin']::staff_role[]))
  with check (has_role(array['management', 'super_admin']::staff_role[]));
