-- The scholarship directory says who may edit it. The code disagreed.
--
-- /setup/scholarship-bodies carries the line "Editable by Processing and Super
-- Admin", but scholarships.manage defaulted to {super_admin} alone — so
-- Processing was told they could edit the directory and then shown no edit
-- controls at all. Since the page states the intent, the permission is brought
-- into line with it rather than the other way around.
--
-- This is a default, so any override already set in Admin > Role Permissions
-- still wins.

update public.permission_definitions
set default_roles = '{super_admin,processing}'
where key = 'scholarships.manage'
  and default_roles = '{super_admin}';
