-- HMARK CRM rebuild — step 15: storage policies for the two new upload
-- paths introduced by the app rework (commission payment proofs, keyed by
-- commission id; partner document exchange, keyed by university id).
-- Both are separate top-level prefixes from the existing "<student_id>/..."
-- convention, so they need their own policies rather than reusing
-- staff_can_view_student()/is_own_student() (which assume folder[1] is a lead id).
-- Run after 0018_reminders_support_tickets.sql.

create policy "documents_storage_commission_proof" on storage.objects for all
  using (
    bucket_id = 'documents'
    and exists (
      select 1 from partner_commissions pc
      join applications a on a.id = pc.application_id
      where pc.id = ((storage.foldername(name))[1])::uuid
        and (has_role(array['finance', 'super_admin']::staff_role[]) or a.university_id = partner_university_id())
    )
  )
  with check (
    bucket_id = 'documents'
    and exists (
      select 1 from partner_commissions pc
      join applications a on a.id = pc.application_id
      where pc.id = ((storage.foldername(name))[1])::uuid
        and (has_role(array['finance', 'super_admin']::staff_role[]) or a.university_id = partner_university_id())
    )
  );

create policy "documents_storage_partner_exchange" on storage.objects for all
  using (
    bucket_id = 'documents'
    and (
      has_role(array['processing', 'super_admin']::staff_role[])
      or ((storage.foldername(name))[1])::uuid = partner_university_id()
    )
  )
  with check (
    bucket_id = 'documents'
    and (
      has_role(array['processing', 'super_admin']::staff_role[])
      or ((storage.foldername(name))[1])::uuid = partner_university_id()
    )
  );
