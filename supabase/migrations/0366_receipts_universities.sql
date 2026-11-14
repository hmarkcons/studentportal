-- Receipts - Universities (2026-11-15).
--
-- 0365's "Application Fee" section is named "Receipts - Universities": it
-- holds each application's receipts and invoices, listed under the
-- university's name. The key stays application_fee, which the policies, the
-- alert trigger and the code all go by; only what people read changes. A
-- receipt can now also be filed from "Documents from the university", which
-- used to file everything as an acceptance letter (and so moved the stages).

do $$
begin
  if not exists (select 1 from public.document_sections where key = 'application_fee') then
    raise exception '0366: expects the application_fee section of 0365';
  end if;
  if to_regprocedure('public.notify_fee_receipts(uuid)') is null then
    raise exception '0366: expects notify_fee_receipts of 0365';
  end if;
end $$;

update public.document_sections set label = 'Receipts - Universities' where key = 'application_fee';

-- The student's alert, in the section's new name; otherwise as 0365's.
create or replace function public.notify_fee_receipts(p_application uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_student uuid;
  v_uni text;
begin
  select a.student_id, u.name into v_student, v_uni
  from applications a
  left join universities u on u.id = a.university_id
  where a.id = p_application and a.fee_receipts_visible;
  if v_student is null then
    return;
  end if;
  perform notify(
    notify_student_user(v_student), 'fee_receipt', 'fee_receipt:' || p_application,
    'Your receipts for ' || coalesce(v_uni, 'your university') || ' are in your portal',
    'Your receipts for ' || coalesce(v_uni, 'your university') || ' are in your portal',
    'Open them from the application, or from Documents › Receipts - Universities.',
    '/portal/applications/' || p_application, null, v_student, true, true
  );
end;
$$;

revoke execute on function public.notify_fee_receipts(uuid) from public, anon, authenticated;

update public.permission_definitions
set description = 'Add a requirement to a student''s checklist, and delete one from it. Deleting also removes any file uploaded against it. Also: file and remove an application''s receipts (Receipts - Universities), and show them to the student.'
where key = 'documents.manage_requirements';

notify pgrst, 'reload schema';
