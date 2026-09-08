-- Let a student replace just the half that was rejected.
--
-- 0122 split the review so staff could send back the video without sending
-- back the agreement, on the grounds that making a student redo both when only
-- one was wrong is needless work. This RPC then undid that: it demanded both
-- paths on every call, so a video-only rejection still forced the student to
-- re-upload the signed agreement they had already got right.
--
-- A null or blank path now means "keep what is on file". Only the half that
-- actually arrives has its review state reset, so an already-approved document
-- stays approved when the video is replaced. The result is still checked to
-- leave both artefacts present, so this cannot be used to clear one.

create or replace function student_submit_signed_agreement(
  p_agreement_id uuid, p_signed_path text, p_video_path text
) returns void language plpgsql security definer as $$
declare
  v_student uuid;
  v_method text;
  v_status text;
  v_existing_doc text;
  v_existing_video text;
  v_new_doc text;
  v_new_video text;
begin
  select student_id, signing_method, status, signed_file_path, video_recording_path
    into v_student, v_method, v_status, v_existing_doc, v_existing_video
    from agreements where id = p_agreement_id;

  if v_student is null then raise exception 'Agreement not found.'; end if;
  if not is_own_student(v_student) then raise exception 'not authorized'; end if;
  if v_method is distinct from 'e_signature' then
    raise exception 'Only e-signature agreements are submitted from the portal.'; end if;
  if v_status = 'signed' then
    raise exception 'This agreement has already been verified — ask your counselor to reopen it.'; end if;

  v_new_doc := nullif(btrim(coalesce(p_signed_path, '')), '');
  v_new_video := nullif(btrim(coalesce(p_video_path, '')), '');

  if v_new_doc is null and v_new_video is null then
    raise exception 'Nothing was attached.'; end if;

  -- Whatever is not being replaced must already be on file: a submission that
  -- left the agreement or the video missing is exactly what the portal gate
  -- exists to prevent.
  if coalesce(v_new_doc, v_existing_doc) is null then
    raise exception 'Attach your signed agreement.'; end if;
  if coalesce(v_new_video, v_existing_video) is null then
    raise exception 'A video recording is required before an e-signed agreement can be submitted.'; end if;

  update agreements
     set signed_file_path      = coalesce(v_new_doc, signed_file_path),
         video_recording_path  = coalesce(v_new_video, video_recording_path),
         document_status       = case when v_new_doc   is not null then 'pending' else document_status end,
         video_status          = case when v_new_video is not null then 'pending' else video_status end,
         document_review_note  = case when v_new_doc   is not null then null else document_review_note end,
         video_review_note     = case when v_new_video is not null then null else video_review_note end
   where id = p_agreement_id;
end; $$;

grant execute on function student_submit_signed_agreement(uuid, text, text) to authenticated;
