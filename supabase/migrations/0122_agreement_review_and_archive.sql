-- Staff review of an e-signed submission: the document and the consent video
-- are judged separately, because one can be fine while the other needs
-- redoing, and asking a student to redo both when only the video was wrong is
-- needless work for them.
--
-- Rejecting never destroys what was submitted. The file is archived first and
-- only then unlinked from the agreement, so the student can upload a
-- replacement while the original stays on record — which is the whole point of
-- holding a consent video in the first place.

alter table agreements
  add column if not exists document_status text not null default 'pending'
    check (document_status in ('pending', 'approved', 'rejected')),
  add column if not exists video_status text not null default 'pending'
    check (video_status in ('pending', 'approved', 'rejected')),
  -- What the student is told to fix. Cleared when they resubmit.
  add column if not exists document_review_note text,
  add column if not exists video_review_note text,
  add column if not exists reviewed_at timestamptz,
  add column if not exists reviewed_by uuid references staff (id);

-- Agreements already marked signed were approved under the old single-step
-- flow; reflect that rather than leaving them looking unreviewed.
update agreements
   set document_status = 'approved', video_status = 'approved'
 where status = 'signed';

create table if not exists agreement_submission_archive (
  id uuid primary key default gen_random_uuid(),
  agreement_id uuid not null references agreements (id) on delete cascade,
  kind text not null check (kind in ('document', 'video')),
  -- The storage object is deliberately NOT deleted; this keeps the pointer.
  file_path text not null,
  reason text,
  archived_at timestamptz not null default now(),
  archived_by uuid references staff (id)
);

create index if not exists agreement_submission_archive_agreement_idx
  on agreement_submission_archive (agreement_id, archived_at desc);

alter table agreement_submission_archive enable row level security;

drop policy if exists "archive_staff_read" on agreement_submission_archive;
create policy "archive_staff_read" on agreement_submission_archive
  for select using (is_active_staff());

drop policy if exists "archive_staff_write" on agreement_submission_archive;
create policy "archive_staff_write" on agreement_submission_archive
  for insert with check (has_role(array['super_admin', 'processing']::staff_role[]));

-- ---------------------------------------------------------------------------
-- Rejecting one half of a submission
-- ---------------------------------------------------------------------------
-- Security definer so the archive write and the unlink happen together: a
-- half-applied rejection would either lose the record of what was submitted or
-- leave the student unable to replace it.
create or replace function reject_agreement_artifact(
  p_agreement_id uuid,
  p_kind text,
  p_reason text
) returns void
language plpgsql security definer as $$
declare
  v_path text;
begin
  if not has_role(array['super_admin', 'processing']::staff_role[]) then
    raise exception 'Only Super Admin/Processing can reject a submission.';
  end if;
  if p_kind not in ('document', 'video') then
    raise exception 'Unknown submission type.';
  end if;
  if coalesce(btrim(p_reason), '') = '' then
    raise exception 'Give the student a reason so they know what to fix.';
  end if;

  select case when p_kind = 'document' then signed_file_path else video_recording_path end
    into v_path
    from agreements where id = p_agreement_id;

  if v_path is null then
    raise exception 'There is nothing submitted to reject.';
  end if;

  insert into agreement_submission_archive (agreement_id, kind, file_path, reason, archived_by)
  values (p_agreement_id, p_kind, v_path, p_reason, auth.uid());

  if p_kind = 'document' then
    update agreements
       set signed_file_path = null,
           document_status = 'rejected',
           document_review_note = p_reason,
           status = case when status = 'signed' then 'pending_signature' else status end,
           reviewed_at = now(),
           reviewed_by = auth.uid()
     where id = p_agreement_id;
  else
    update agreements
       set video_recording_path = null,
           video_status = 'rejected',
           video_review_note = p_reason,
           status = case when status = 'signed' then 'pending_signature' else status end,
           reviewed_at = now(),
           reviewed_by = auth.uid()
     where id = p_agreement_id;
  end if;
end;
$$;

grant execute on function reject_agreement_artifact(uuid, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Resubmission clears the rejection
-- ---------------------------------------------------------------------------
-- The student-side submit RPC (0117) refused to run once an agreement was
-- signed. It must also reset the review state, otherwise a replacement upload
-- would still carry the previous rejection note and status.
create or replace function student_submit_signed_agreement(
  p_agreement_id uuid, p_signed_path text, p_video_path text
) returns void language plpgsql security definer as $$
declare v_student uuid; v_method text; v_status text;
begin
  select student_id, signing_method, status into v_student, v_method, v_status
  from agreements where id = p_agreement_id;
  if v_student is null then raise exception 'Agreement not found.'; end if;
  if not is_own_student(v_student) then raise exception 'not authorized'; end if;
  if v_method is distinct from 'e_signature' then
    raise exception 'Only e-signature agreements are submitted from the portal.'; end if;
  if v_status = 'signed' then
    raise exception 'This agreement has already been verified — ask your counselor to reopen it.'; end if;
  if p_signed_path is null or btrim(p_signed_path) = '' then
    raise exception 'Attach your signed agreement.'; end if;
  if p_video_path is null or btrim(p_video_path) = '' then
    raise exception 'A video recording is required before an e-signed agreement can be submitted.'; end if;

  update agreements
     set signed_file_path = p_signed_path,
         video_recording_path = p_video_path,
         document_status = 'pending',
         video_status = 'pending',
         document_review_note = null,
         video_review_note = null
   where id = p_agreement_id;
end; $$;
