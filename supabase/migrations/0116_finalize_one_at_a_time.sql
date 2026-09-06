-- "Only one finalized university at a time" was enforced in the server
-- action, which left the rule bypassable by anything calling this RPC
-- directly — and the function's own first statement clears every flag, so a
-- direct call would silently move the finalization rather than refuse.
--
-- The rule now lives here, next to the write it governs. Un-finalizing stays
-- the explicit way to switch, exactly as it is in the UI.
create or replace function finalize_application(p_application_id uuid, p_student_id uuid) returns void
language plpgsql security definer as $$
declare
  v_other_finalized boolean;
  v_exists boolean;
begin
  if not staff_can_view_student(p_student_id) then
    raise exception 'not authorized';
  end if;

  -- Previously a mismatched application/student pair updated zero rows and
  -- reported success; say so instead.
  select exists (
    select 1 from applications where id = p_application_id and student_id = p_student_id
  ) into v_exists;
  if not v_exists then
    raise exception 'That application does not belong to this student.';
  end if;

  select exists (
    select 1 from applications
    where student_id = p_student_id and is_finalized and id <> p_application_id
  ) into v_other_finalized;
  if v_other_finalized then
    raise exception 'Another university is already finalized for visa. Un-finalize it first to choose a different one.';
  end if;

  -- Still clears first: harmless when the guard above passed, and it
  -- self-heals a student who somehow ended up with more than one flag set.
  update applications set is_finalized = false where student_id = p_student_id;
  update applications set is_finalized = true where id = p_application_id and student_id = p_student_id;
end;
$$;
