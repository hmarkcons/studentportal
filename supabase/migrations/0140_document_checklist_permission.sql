-- The Create Doc Checklist builder's own permission, so it appears in
-- Admin > Role Permissions like every other capability rather than being a
-- role test hardcoded in the page.
--
-- Defaults to Super Admin and Processing, per the brief. The RLS policies from
-- 0137 gate the same two roles at the database, so an override granted here to
-- a third role would let the UI through and then fail on write — the app layer
-- is the adjustable one, the database is the floor.

insert into public.permission_definitions (key, category, label, description, default_roles, sort_order)
values (
  'document_checklist.manage',
  'Setup',
  'Build document checklists',
  'Create and edit the document checklist for each destination: add or remove sections and requirements, and reorder them.',
  '{super_admin,processing}',
  (select coalesce(max(sort_order), 0) + 10 from public.permission_definitions)
)
on conflict (key) do update
  set category = excluded.category,
      label = excluded.label,
      description = excluded.description;
