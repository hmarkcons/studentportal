-- Who may download the universities sheet and the catalogue workbook from
-- Setup › Universities (0338).
--
-- The catalogue export already existed, for any signed-in staff member who
-- knew its address, and was offered only beside the Super Admin's import. It
-- is now offered beside the page's search, for what the search shows, along
-- with a universities-only sheet — so it gets a switch of its own. On by
-- default for everyone who can open the page (Management, Counsellors,
-- Processing; a Super Admin holds every permission), and a Super Admin can
-- turn it off for a role or for one person on the Role Permissions screen.
-- Importing stays the Super Admin's alone.
--
-- Nothing in the database reads it: the catalogue is no more readable than it
-- was (RLS lets staff read it), and the switch is checked by the two export
-- routes themselves.

insert into public.permission_definitions (key, category, label, description, default_roles, sort_order) values
  ('catalogue.export', 'Setup', 'Export universities & catalogue', 'Download the universities sheet and the catalogue workbook (programmes and rounds) from Setup → Universities, for what the search shows.', array['management', 'counselor', 'processing']::staff_role[], (select coalesce(max(sort_order), 0) + 10 from public.permission_definitions))
on conflict (key) do update set category = excluded.category, label = excluded.label, description = excluded.description;
