-- The interview feature's own permission, so it appears in
-- Admin > Role Permissions rather than being a role test buried in an action.
--
-- Defaults to Super Admin and Processing, per the brief. The RLS policies in
-- 0151 gate the same two roles at the database, which is the floor an
-- app-layer override cannot lower.

insert into public.permission_definitions (key, category, label, description, default_roles, sort_order)
values (
  'interviews.manage',
  'Students',
  'Schedule admission interviews',
  'Add, edit and remove the interviews a university requires for an application, including the login credentials and whether the student is shown them.',
  '{super_admin,processing}',
  (select coalesce(max(sort_order), 0) + 10 from public.permission_definitions)
)
on conflict (key) do update
  set category = excluded.category,
      label = excluded.label,
      description = excluded.description;
