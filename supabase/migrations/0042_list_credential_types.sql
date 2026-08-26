-- CRM overhaul: lets the UI list which credential types already exist for a
-- student (so staff can add an arbitrary named portal credential — e.g.
-- Gmail — and see it again on reload) without exposing the encrypted values
-- outside store_credential/read_credential.

create or replace function list_credential_types(p_owner_type text, p_owner_id uuid) returns text[]
language plpgsql security definer stable as $$
declare
  v_student_id uuid;
begin
  v_student_id := resolve_credential_student_id(p_owner_type, p_owner_id);
  if not (staff_can_view_student(v_student_id) or is_own_student(v_student_id)) then
    raise exception 'not authorized';
  end if;

  return coalesce(
    (select array_agg(credential_type order by credential_type) from encrypted_credentials
      where owner_type = p_owner_type and owner_id = p_owner_id),
    '{}'::text[]
  );
end;
$$;

grant execute on function list_credential_types(text, uuid) to authenticated;
