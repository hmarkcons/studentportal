-- Who may add or remove a requirement on one student's checklist.
--
-- deleteDocumentRequirement had no permission check of any kind, and it
-- removes the stored file as well as the row — so anyone who could open a
-- student's Documents tab could delete a verified passport scan. RLS did not
-- stop it either: student_documents_staff_write is is_active_staff(), which is
-- every role. addDocumentRequirement was equally open.
--
-- The brief puts this with Super Admin and the Processing team. Reviewing a
-- document (accept / reject) is deliberately left as it was: a counselor
-- checking their own student's upload is ordinary work, and RLS already scopes
-- them to their own students.

insert into public.permission_definitions (key, category, label, description, default_roles, sort_order)
values (
  'documents.manage_requirements',
  'Students',
  'Add and remove document requirements',
  'Add a requirement to a student''s checklist, and delete one from it. Deleting also removes any file uploaded against it.',
  '{super_admin,processing}',
  (select coalesce(max(sort_order), 0) + 10 from public.permission_definitions)
)
on conflict (key) do update
  set category = excluded.category,
      label = excluded.label,
      description = excluded.description;
