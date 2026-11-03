-- The Reports section of a registered student's dashboard (0348): the
-- documents checklist and the applications & portal logins for that student
-- alone, with PDF and Excel downloads — before the Documentation tracker.
--
-- One switch in Admin › Role Permissions, under "Registered student ·
-- Reports", so any role can be given it later. It starts with Processing
-- (a Super Admin holds every permission, so is never listed), as the office
-- asked: the processing officer and the Super Admin.
--
-- The code checks it twice: the dashboard shows the section only to someone
-- holding it, and the two report downloads accept it for one student's file
-- (reportDownloadAccess). It never opens the whole reports in Reports — those
-- keep their own audience. Row-level security stays the hard boundary: the
-- applications' logins still come back only for a student the caller may see
-- (application_logins, 0347).

with base as (select coalesce(max(sort_order), 0) as m from public.permission_definitions)
insert into public.permission_definitions (key, category, label, description, default_roles, sort_order)
select 'student.reports.view',
       'Registered student · Reports',
       'See the Reports section',
       'See the Reports section on a registered student''s dashboard and download their documents checklist and their applications & portal logins (PDF or Excel). The applications file contains passwords.',
       array['processing']::staff_role[],
       base.m + 1
from base
on conflict (key) do update set
  category = excluded.category,
  label = excluded.label,
  description = excluded.description;
