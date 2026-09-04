-- delete_owned_credentials (0076) wipes EVERY credential type for an owner —
-- too broad for "delete this student's portal login" alone, which must
-- leave their other stored credentials (Gmail, university portal, etc.)
-- untouched. Same security-definer auth check as store_credential/
-- read_credential/delete_owned_credentials, just scoped to one credential
-- type.
create or replace function delete_credential(p_owner_type text, p_owner_id uuid, p_credential_type text) returns void
language plpgsql security definer as $$
declare
  v_student_id uuid;
begin
  v_student_id := resolve_credential_student_id(p_owner_type, p_owner_id);
  if not (staff_can_view_student(v_student_id) or is_own_student(v_student_id)) then
    raise exception 'not authorized';
  end if;

  delete from encrypted_credentials where owner_type = p_owner_type and owner_id = p_owner_id and credential_type = p_credential_type;
end;
$$;

grant execute on function delete_credential(text, uuid, text) to authenticated;
