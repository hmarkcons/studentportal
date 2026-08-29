-- Two storage.objects gaps found auditing the 'documents' bucket against
-- actual upload/download call sites — same silent-RLS-block bug class as
-- 0075-0078, but for storage rather than table policies.

-- 1. markStaffCommissionPaid/uploadStaffCommissionProof (finance.ts) upload
--    to "<staff_commissions.id>/proof-...", but no storage policy's path
--    condition ever matched that id space (documents_storage_commission_proof
--    joins partner_commissions, a different table entirely). The feature
--    has never worked for anyone, any role, since it was built — every
--    upload attempt returns a real error. Fix: add a policy matching
--    staff_commissions_write's role list (finance/super_admin), scoped by
--    existence in staff_commissions the same way documents_storage_
--    commission_proof is scoped by existence in partner_commissions.
create policy "documents_storage_staff_commission_proof" on storage.objects for all
  using (
    bucket_id = 'documents'
    and has_role(array['finance', 'super_admin']::staff_role[])
    and exists (select 1 from staff_commissions sc where sc.id = safe_uuid((storage.foldername(name))[1]))
  )
  with check (
    bucket_id = 'documents'
    and has_role(array['finance', 'super_admin']::staff_role[])
    and exists (select 1 from staff_commissions sc where sc.id = safe_uuid((storage.foldername(name))[1]))
  );

-- 2. generateAgreementPdf (agreements.ts) downloads a fixed
--    "branding/hmark-signature.png" path to embed HMARK's signature into
--    generated agreement PDFs, same pattern as 0046's literal-prefix
--    carve-out for "agreement-templates/...". No existing policy's prefix
--    condition matches a literal "branding" folder, so the download always
--    returned null — every agreement PDF generated has silently rendered
--    without the signature image, with no error anywhere (the code treats
--    a missing signature file as an acceptable degrade, not a failure).
--    Scoped to processing/super_admin, matching agreements_update and the
--    UI gate on who can trigger PDF generation.
create policy "documents_storage_branding" on storage.objects for select
  using (
    bucket_id = 'documents'
    and (storage.foldername(name))[1] = 'branding'
    and has_role(array['processing', 'super_admin']::staff_role[])
  );
