-- E-signature (outside Karachi) agreements are signed and submitted by the
-- student themself; staff only verify afterwards. Students can't update
-- agreements directly — agreements_update is limited to processing/super_admin
-- (0041), and RLS is row-level, so widening it would also hand students the
-- fee overrides and status on the same row.
--
-- This function is the narrow exception: it writes only the two paths, only
-- for the caller's own agreement, only when it's an e-signature one that
-- hasn't been verified yet, and only with a video attached — the video being
-- what makes the e-signature attributable later.
--
-- Status deliberately stays put: submitting is not signing. Staff move it to
-- 'signed' once they've watched the video and checked the document.
create or replace function student_submit_signed_agreement(
  p_agreement_id uuid,
  p_signed_path text,
  p_video_path text
) returns void
language plpgsql security definer as $$
declare
  v_student uuid;
  v_method text;
  v_status text;
begin
  select student_id, signing_method, status
    into v_student, v_method, v_status
  from agreements where id = p_agreement_id;

  if v_student is null then
    raise exception 'Agreement not found.';
  end if;

  if not is_own_student(v_student) then
    raise exception 'not authorized';
  end if;

  if v_method is distinct from 'e_signature' then
    raise exception 'Only e-signature agreements are submitted from the portal.';
  end if;

  if v_status = 'signed' then
    raise exception 'This agreement has already been verified — ask your counselor to reopen it.';
  end if;

  if p_signed_path is null or btrim(p_signed_path) = '' then
    raise exception 'Attach your signed agreement.';
  end if;

  if p_video_path is null or btrim(p_video_path) = '' then
    raise exception 'A video recording is required before an e-signed agreement can be submitted.';
  end if;

  update agreements
     set signed_file_path = p_signed_path,
         video_recording_path = p_video_path
   where id = p_agreement_id;
end;
$$;
