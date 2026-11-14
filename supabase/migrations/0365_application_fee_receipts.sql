-- Application fee receipts, per application (2026-11-15).
--
-- Processing files the receipts of an application's fee on the application:
-- one or many, each kept as its own file. They are held in a new
-- "Application Fee" section of the student's documents — one requirement per
-- application, "Application fee receipt", its files in student_document_files
-- (0328) as any document's are, approved as they are filed.
--
-- The student does not see them until a staff member ticks "Show to the
-- student" on that application (applications.fee_receipts_visible). Hidden
-- means hidden everywhere the student could look: the document rows (RLS),
-- the files themselves in storage (they live under <student>/fee-receipts/
-- <application>/, which the student may not read, write or list until then),
-- and alerts (the document trigger says nothing about them; the student is
-- told once, when they are shown). A partner university never sees them.

do $$
begin
  if to_regclass('public.document_sections') is null or to_regclass('public.destination_document_sections') is null then
    raise exception '0365: expects the document checklist tables of 0137';
  end if;
  if to_regclass('public.student_document_files') is null then
    raise exception '0365: expects student_document_files (0328)';
  end if;
end $$;

-- 1 ------------------------------------------------------- the switch
alter table public.applications
  add column if not exists fee_receipts_visible boolean not null default false;

-- 2 --------------------------------------------- the Documents section
-- After the admission documents (10), before the acceptance letters (15).
insert into public.document_sections (key, label, is_predefined, sort_order)
values ('application_fee', 'Application Fee', true, 12)
on conflict (key) do update set label = excluded.label, is_predefined = true, sort_order = excluded.sort_order;

insert into public.destination_document_sections (destination_id, section_key, sort_order)
values (null, 'application_fee', 12)
on conflict do nothing;

-- 3 ------------------------------------------ what the student may read
-- As 0011's policy, less an application's fee receipts until they are shown.
drop policy if exists "student_documents_select" on public.student_documents;
create policy "student_documents_select" on public.student_documents for select
  using (
    staff_can_view_student(student_id)
    or (
      is_own_student(student_id)
      and (
        category is distinct from 'application_fee'
        or exists (select 1 from public.applications a where a.id = student_documents.application_id and a.fee_receipts_visible)
      )
    )
  );

-- 0003's own-documents policy went with the table in 0011; dropped here in
-- case any copy of it survives, since it would read past the line above.
drop policy if exists "student_documents_select_self" on public.student_documents;

-- 0083's upload policy, less the receipts: a student never writes one, shown or not.
drop policy if exists "student_documents_upload_self" on public.student_documents;
create policy "student_documents_upload_self" on public.student_documents for update
  using (is_own_student(student_id) and status <> 'verified' and category is distinct from 'application_fee')
  with check (status = 'submitted' and is_own_student(student_id) and category is distinct from 'application_fee');

-- A partner university reads documents tied to its applications (0016) — never the fee receipts.
drop policy if exists "student_documents_select_partner_full" on public.student_documents;
create policy "student_documents_select_partner_full" on public.student_documents for select
  using (
    student_documents.category is distinct from 'application_fee'
    and exists (
      select 1 from public.applications a
      join public.universities u on u.id = a.university_id
      where a.id = student_documents.application_id
        and u.id = partner_university_id()
        and u.student_visibility_mode = 'full'
    )
  );

-- 4 ------------------------------------------------------ the files themselves
-- 0047/0059 let a student read, add and replace anything under their own
-- folder. The receipts' folder is read only once shown, and never written.
drop policy if exists "documents_storage_select_self" on storage.objects;
create policy "documents_storage_select_self" on storage.objects for select
  using (
    bucket_id = 'documents'
    and is_own_student(safe_uuid((storage.foldername(name))[1]))
    and (
      (storage.foldername(name))[2] is distinct from 'fee-receipts'
      or exists (
        select 1 from public.applications a
        where a.id = safe_uuid((storage.foldername(name))[3])
          and a.student_id = safe_uuid((storage.foldername(name))[1])
          and a.fee_receipts_visible
      )
    )
  );

drop policy if exists "documents_storage_insert_self" on storage.objects;
create policy "documents_storage_insert_self" on storage.objects for insert
  with check (
    bucket_id = 'documents'
    and is_own_student(safe_uuid((storage.foldername(name))[1]))
    and (storage.foldername(name))[2] is distinct from 'fee-receipts'
  );

drop policy if exists "documents_storage_update_self" on storage.objects;
create policy "documents_storage_update_self" on storage.objects for update
  using (
    bucket_id = 'documents'
    and is_own_student(safe_uuid((storage.foldername(name))[1]))
    and (storage.foldername(name))[2] is distinct from 'fee-receipts'
  )
  with check (
    bucket_id = 'documents'
    and is_own_student(safe_uuid((storage.foldername(name))[1]))
    and (storage.foldername(name))[2] is distinct from 'fee-receipts'
  );

-- A partner university reaches the folder of any student with an application
-- at it (0025/0047), for its letters — never the receipts' folder.
drop policy if exists "documents_storage_partner_letters" on storage.objects;
create policy "documents_storage_partner_letters" on storage.objects for all
  using (
    bucket_id = 'documents'
    and (storage.foldername(name))[2] is distinct from 'fee-receipts'
    and exists (
      select 1 from applications a
      where a.student_id = safe_uuid((storage.foldername(name))[1])
        and a.university_id = partner_university_id()
    )
  )
  with check (
    bucket_id = 'documents'
    and (storage.foldername(name))[2] is distinct from 'fee-receipts'
    and exists (
      select 1 from applications a
      where a.student_id = safe_uuid((storage.foldername(name))[1])
        and a.university_id = partner_university_id()
    )
  );

-- 5 ------------------------------------------------------------ alerts
-- 0320's document alerts, unchanged, except that they say nothing about a fee
-- receipt: approving one would otherwise tell the student about a receipt
-- they cannot see. They are told once, when the receipts are shown.
create or replace function public.notifications_on_document() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_doc text;
  v_name text;
begin
  if new.category = 'application_fee' then
    return null;
  end if;

  v_doc := coalesce(
    nullif(btrim(new.custom_name), ''),
    (select name from document_templates where id = new.template_id),
    initcap(replace(coalesce(new.category, ''), '_', ' ')),
    'A document'
  );
  if v_doc = '' then
    v_doc := 'A document';
  end if;

  if new.status = 'submitted'
     and coalesce(new.uploaded_by_role, 'student') = 'student'
     and (tg_op = 'INSERT' or old.status is distinct from 'submitted') then
    select full_name into v_name from leads where id = new.student_id;
    perform notify(notify_student_handler(new.student_id), 'document_submitted', 'documents:' || new.student_id,
      coalesce(v_name, 'A student') || ' uploaded ' || v_doc, coalesce(v_name, 'A student') || ' uploaded {n} documents',
      'Waiting for your review.', '/students/' || new.student_id || '/documents', null, new.student_id, false, true);
  elsif tg_op = 'UPDATE' and new.status in ('verified', 'rejected') and old.status is distinct from new.status then
    if new.status = 'verified' then
      perform notify(notify_student_user(new.student_id), 'document_approved', 'document_approved:' || new.student_id,
        v_doc || ' approved', '{n} documents approved', null, '/portal/documents', null, new.student_id, true, true);
    else
      perform notify(notify_student_user(new.student_id), 'document_rejected', 'document_rejected:' || new.student_id,
        v_doc || ' needs uploading again', '{n} documents need uploading again',
        nullif(btrim(coalesce(new.rejected_reason, '')), ''), '/portal/documents', null, new.student_id, true, true);
    end if;
    -- Nothing of theirs left to review: the staff alert is done.
    if not exists (select 1 from student_documents where student_id = new.student_id and status in ('submitted', 'under_review')) then
      update notifications set read_at = now() where read_at is null and group_key = 'documents:' || new.student_id;
    end if;
  end if;
  return null;
end;
$$;

-- The student's alert, when an application's receipts are shown to them (or
-- another is added while they are shown). Called by the server only.
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
    'Your application fee receipt for ' || coalesce(v_uni, 'your university') || ' is in your portal',
    'Your application fee receipts for ' || coalesce(v_uni, 'your university') || ' are in your portal',
    'Open it from the application, or from Documents › Application Fee.',
    '/portal/applications/' || p_application, null, v_student, true, true
  );
end;
$$;

revoke execute on function public.notify_fee_receipts(uuid) from public, anon, authenticated;

-- 6 ------------------------------------------------- who files them
-- The permission that already decides who adds and removes requirements
-- (0141: Super Admin and Processing) now decides the receipts too; say so
-- where it is granted.
update public.permission_definitions
set description = 'Add a requirement to a student''s checklist, and delete one from it. Deleting also removes any file uploaded against it. Also: file and remove an application''s fee receipts, and show them to the student.'
where key = 'documents.manage_requirements';

notify pgrst, 'reload schema';
