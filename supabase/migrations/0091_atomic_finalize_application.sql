-- finalizeApplication() (src/lib/actions/applications.ts) cleared
-- is_finalized on every one of the student's applications, then set it on
-- the target application, as two separate client-side writes. If the first
-- succeeded but the second failed (network blip, applicationId mismatch),
-- every application ends up unfinalized and none replaces it — silently
-- discarding the student's Visa-tab anchor ("the Visa tab only shows the
-- finalized application", per the function's own comment). Same shape as
-- the invoice/commission-credit bugs already fixed (migration 0090); same
-- fix — one security-definer function so both updates commit or fail
-- together.
create or replace function finalize_application(p_application_id uuid, p_student_id uuid) returns void
language plpgsql security definer as $$
begin
  if not staff_can_view_student(p_student_id) then
    raise exception 'not authorized';
  end if;

  update applications set is_finalized = false where student_id = p_student_id;
  update applications set is_finalized = true where id = p_application_id and student_id = p_student_id;
end;
$$;

grant execute on function finalize_application(uuid, uuid) to authenticated;
