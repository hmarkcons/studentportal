-- Add / edit / delete permissions for each section of a REGISTERED student
-- (0343): Profile, Applications, Documents, Scholarship, Visa, Communication.
--
-- Until now these writes were gated by RLS alone — there was no switch in
-- Admin › Role Permissions to say which roles may add, change or remove a
-- registered student's records. These rows give the Role Permissions matrix a
-- toggle for each real operation; the staff-side write actions check them on
-- top of RLS (see requireStaffStudentWrite in src/lib/auth/permissions.ts).
--
-- IMPORTANT, two ways:
--   * A student editing their OWN record in the portal is never gated by these
--     — the gate is staff-only, so self-service and RLS are untouched.
--   * RLS stays the hard boundary. A toggle can only restrict within what RLS
--     already allows; it can never grant access RLS refuses.
--
-- Defaults preserve today's access, so nothing changes until a Super Admin
-- flips a switch:
--   * Profile       → whoever can view the student (assigned counsellor,
--                     processing, management, finance; staff_can_view_student).
--   * Applications  } processing, management, finance — who may process a
--   * Documents     } registered student (staff_can_process_student; a
--                     counsellor is RLS-locked out of these after registration).
--   * Scholarship   → processing (matches scholarships.manage).
--   * Visa          → processing (the visa section is Processing + Super Admin).
--   * Communication → anyone who may message a student (counsellor, processing,
--                     management, finance, marketing, digital marketing).
-- A Super Admin holds every permission, so is never listed.
--
-- Visa and Communication have only one real write each in the code (the visa
-- tracker is edited in place; a message is sent), so only that one operation
-- gets a key — no switches that gate nothing.
--
-- Nothing in the database reads these keys; the write actions check them.

with base as (select coalesce(max(sort_order), 0) as m from public.permission_definitions)
insert into public.permission_definitions (key, category, label, description, default_roles, sort_order)
select v.key, v.category, v.label, v.description, v.default_roles, base.m + v.ord
from base, (values
  ('student.profile.add',        'Registered student · Profile',       'Add profile records',        'Add to a registered student''s profile: test scores, academics, travel/visa entries, photo.',                                  array['counselor','processing','management','finance']::staff_role[],                               10),
  ('student.profile.edit',       'Registered student · Profile',       'Edit profile',               'Edit a registered student''s profile: personal details, photo, test scores, academics, travel/visa history.',                  array['counselor','processing','management','finance']::staff_role[],                               20),
  ('student.profile.delete',     'Registered student · Profile',       'Delete profile records',     'Remove records from a registered student''s profile: test scores, academics, travel/visa entries, photo.',                     array['counselor','processing','management','finance']::staff_role[],                               30),
  ('student.applications.add',   'Registered student · Applications',  'Add applications',           'Create applications for a registered student, add backup programmes, and add application tasks.',                              array['processing','management','finance']::staff_role[],                                           40),
  ('student.applications.edit',  'Registered student · Applications',  'Edit applications',          'Change a registered student''s applications: stage, details, links, order, finalise/un-finalise, and task updates.',           array['processing','management','finance']::staff_role[],                                           50),
  ('student.applications.delete','Registered student · Applications',  'Delete applications',        'Delete a registered student''s applications and application tasks.',                                                           array['processing','management','finance']::staff_role[],                                           60),
  ('student.documents.add',      'Registered student · Documents',     'Upload documents',           'Upload document files for a registered student.',                                                                             array['processing','management','finance']::staff_role[],                                           70),
  ('student.documents.edit',     'Registered student · Documents',     'Review documents',           'Review a registered student''s document files — approve or send back.',                                                        array['processing','management','finance']::staff_role[],                                           80),
  ('student.documents.delete',   'Registered student · Documents',     'Remove documents',           'Remove document files from a registered student''s requirements.',                                                             array['processing','management','finance']::staff_role[],                                           90),
  ('student.scholarship.add',    'Registered student · Scholarship',   'Add scholarships',           'Add scholarship records to a registered student.',                                                                            array['processing']::staff_role[],                                                                 100),
  ('student.scholarship.edit',   'Registered student · Scholarship',   'Edit scholarships',          'Edit a registered student''s scholarship records.',                                                                           array['processing']::staff_role[],                                                                 110),
  ('student.scholarship.delete', 'Registered student · Scholarship',   'Delete scholarships',        'Delete a registered student''s scholarship records.',                                                                         array['processing']::staff_role[],                                                                 120),
  ('student.visa.edit',          'Registered student · Visa',          'Edit visa tracker',          'Edit a registered student''s visa section: the per-country visa/document tracker and credentials.',                           array['processing']::staff_role[],                                                                 130),
  ('student.communication.send', 'Registered student · Communication', 'Send messages',              'Send a portal message to a registered student.',                                                                              array['counselor','processing','management','finance','marketing','digital_marketing']::staff_role[], 140)
) as v(key, category, label, description, default_roles, ord)
on conflict (key) do update set
  category = excluded.category,
  label = excluded.label,
  description = excluded.description;
