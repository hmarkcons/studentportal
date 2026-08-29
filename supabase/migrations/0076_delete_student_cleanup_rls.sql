-- Same silent-RLS-block bug class as 0075, found while auditing leads_delete
-- and its blast radius: deleteStudent() (src/lib/actions/leads.ts) does
-- pre-delete cleanup on two child tables before deleting the lead row, and
-- both cleanup statements were silently no-ops.

-- 1. partner_document_exchange had no UPDATE policy at all. deleteStudent()
--    nulls out student_id there to detach the row (it belongs to the
--    partner, not the student) before deleting the lead — but with no
--    matching policy the update matched zero rows, so student_id was never
--    cleared. student_id references leads(id) with no ON DELETE clause
--    (defaults to NO ACTION), so the following `delete from leads` then
--    failed outright with a foreign-key-violation error: any student with
--    partner-exchanged documents could not be deleted at all. Fix: add an
--    UPDATE policy matching the existing insert_staff policy's role list.
create policy "partner_document_exchange_update_staff" on partner_document_exchange for update
  using (has_role(array['processing', 'super_admin']::staff_role[]))
  with check (has_role(array['processing', 'super_admin']::staff_role[]));

-- 2. encrypted_credentials intentionally has zero direct-access policies —
--    every other access path goes through store_credential/read_credential
--    (security definer, own auth check). deleteStudent() instead ran a raw
--    client-side `.delete()` against the table directly, which RLS silently
--    blocked (no error, no rows affected) — orphaned encrypted credential
--    rows for deleted students/applications were never actually cleaned up.
--    Fix: add a matching security-definer RPC (same auth check as
--    store_credential/read_credential) instead of granting a raw policy,
--    to keep this table's "only through a checked RPC" access pattern
--    intact rather than special-casing an exception.
create or replace function delete_owned_credentials(p_owner_type text, p_owner_id uuid) returns void
language plpgsql security definer as $$
declare
  v_student_id uuid;
begin
  v_student_id := resolve_credential_student_id(p_owner_type, p_owner_id);
  if not (staff_can_view_student(v_student_id) or is_own_student(v_student_id)) then
    raise exception 'not authorized';
  end if;

  delete from encrypted_credentials where owner_type = p_owner_type and owner_id = p_owner_id;
end;
$$;

grant execute on function delete_owned_credentials(text, uuid) to authenticated;
