-- Fix a real bug found while testing agreement-template uploads: every
-- storage.objects policy for the 'documents' bucket does
-- `((storage.foldername(name))[1])::uuid` directly. Postgres evaluates every
-- policy on a table for a given operation — if ANY one of them throws while
-- casting a non-UUID folder prefix (e.g. this session's new
-- "agreement-templates/..." prefix, or any future non-student-scoped
-- prefix), the WHOLE access check fails with that exception, even though a
-- different, correctly-scoped policy would have granted access. Adding a
-- new narrowly-scoped policy (0046) does not fix this on its own — the
-- older policies still blow up first.
--
-- Fix: a safe_uuid() helper that returns null instead of raising on
-- invalid input, so a mismatched prefix just fails that one policy's
-- condition (null is falsy) instead of aborting the whole check. Every
-- existing policy that casts foldername to uuid is rewritten to use it.

create or replace function safe_uuid(p_text text) returns uuid
language plpgsql immutable as $$
begin
  return p_text::uuid;
exception when invalid_text_representation then
  return null;
end;
$$;

-- 0011: staff/self document access, keyed by "<student_id>/..."
drop policy if exists "documents_storage_staff" on storage.objects;
drop policy if exists "documents_storage_select_self" on storage.objects;
drop policy if exists "documents_storage_insert_self" on storage.objects;

create policy "documents_storage_staff" on storage.objects for all
  using (bucket_id = 'documents' and staff_can_view_student(safe_uuid((storage.foldername(name))[1])))
  with check (bucket_id = 'documents' and staff_can_view_student(safe_uuid((storage.foldername(name))[1])));

create policy "documents_storage_select_self" on storage.objects for select
  using (bucket_id = 'documents' and is_own_student(safe_uuid((storage.foldername(name))[1])));

create policy "documents_storage_insert_self" on storage.objects for insert
  with check (bucket_id = 'documents' and is_own_student(safe_uuid((storage.foldername(name))[1])));

-- 0019: commission proofs keyed by "<commission_id>/...", partner exchange
-- keyed by "<university_id>/..."
drop policy if exists "documents_storage_commission_proof" on storage.objects;
drop policy if exists "documents_storage_partner_exchange" on storage.objects;

create policy "documents_storage_commission_proof" on storage.objects for all
  using (
    bucket_id = 'documents'
    and exists (
      select 1 from partner_commissions pc
      join applications a on a.id = pc.application_id
      where pc.id = safe_uuid((storage.foldername(name))[1])
        and (has_role(array['finance', 'super_admin']::staff_role[]) or a.university_id = partner_university_id())
    )
  )
  with check (
    bucket_id = 'documents'
    and exists (
      select 1 from partner_commissions pc
      join applications a on a.id = pc.application_id
      where pc.id = safe_uuid((storage.foldername(name))[1])
        and (has_role(array['finance', 'super_admin']::staff_role[]) or a.university_id = partner_university_id())
    )
  );

create policy "documents_storage_partner_exchange" on storage.objects for all
  using (
    bucket_id = 'documents'
    and (
      has_role(array['processing', 'super_admin']::staff_role[])
      or safe_uuid((storage.foldername(name))[1]) = partner_university_id()
    )
  )
  with check (
    bucket_id = 'documents'
    and (
      has_role(array['processing', 'super_admin']::staff_role[])
      or safe_uuid((storage.foldername(name))[1]) = partner_university_id()
    )
  );

-- 0025: partner offer/enrollment letters keyed by "<application's student_id>/..."
drop policy if exists "documents_storage_partner_letters" on storage.objects;

create policy "documents_storage_partner_letters" on storage.objects for all
  using (
    bucket_id = 'documents'
    and exists (
      select 1 from applications a
      where a.student_id = safe_uuid((storage.foldername(name))[1])
        and a.university_id = partner_university_id()
    )
  )
  with check (
    bucket_id = 'documents'
    and exists (
      select 1 from applications a
      where a.student_id = safe_uuid((storage.foldername(name))[1])
        and a.university_id = partner_university_id()
    )
  );
