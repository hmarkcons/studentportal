-- Let staff take back an approval of an e-signed agreement or its consent
-- video.
--
-- Approving was a one-way door. verifySignedAgreement sets status = 'signed'
-- and both halves to 'approved', and from that point the review panel
-- disappears from the student page — so a mistaken approval (the wrong video
-- watched, the wrong file opened, a colleague clicking through) could only be
-- undone by deleting the whole agreement and regenerating it, which throws
-- away the student's signed copy and their recording.
--
-- An undo is not a rejection, and the difference matters:
--
--   * a rejection archives the file, unlinks it, and asks the student to
--     replace it (0122);
--   * an undo leaves everything exactly where it is and puts the submission
--     back in front of staff. The student may have nothing at all to do.
--
-- So this touches no file and no storage object. It moves the review state
-- back to pending, returns the agreement to 'pending_signature', and records
-- who took the approval back, when, and optionally why.

alter table agreements add column if not exists approval_undone_at timestamptz;
alter table agreements add column if not exists approval_undone_by uuid;
alter table agreements add column if not exists approval_undo_note text;

-- The record outlives the person, as with audit_log.actor_id in 0136.
alter table agreements drop constraint if exists agreements_approval_undone_by_fkey;
alter table agreements
  add constraint agreements_approval_undone_by_fkey
  foreign key (approval_undone_by) references staff (id) on delete set null;

alter table agreements drop constraint if exists agreements_approval_undo_note_length;
alter table agreements
  add constraint agreements_approval_undo_note_length
  check (approval_undo_note is null or (btrim(approval_undo_note) <> '' and length(approval_undo_note) <= 500));

comment on column agreements.approval_undone_at is
  'When an approval was last taken back. Cleared when the submission is approved again.';

-- ---------------------------------------------------------------------------
-- Taking the approval back
-- ---------------------------------------------------------------------------
-- Security definer for the same reason as the reject path: the half-status,
-- the agreement status and the audit fields have to move together, and a
-- half-applied undo would leave an agreement that reads as approved on one
-- screen and not on another.
--
-- p_kind: 'document', 'video', or 'both'. Either half can be the mistake on
-- its own, which is how rejecting already works.
create or replace function undo_agreement_approval(
  p_agreement_id uuid,
  p_kind text,
  p_note text default null
) returns void
language plpgsql security definer as $$
declare
  v_agreement agreements%rowtype;
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
begin
  if not has_role(array['super_admin', 'processing']::staff_role[]) then
    raise exception 'Only Super Admin/Processing can undo an approval.';
  end if;
  if p_kind not in ('document', 'video', 'both') then
    raise exception 'Unknown submission type.';
  end if;
  if v_note is not null and length(v_note) > 500 then
    raise exception 'Keep the note under 500 characters.';
  end if;

  select * into v_agreement from agreements where id = p_agreement_id for update;
  if v_agreement.id is null then
    raise exception 'Agreement not found.';
  end if;
  if v_agreement.signing_method is distinct from 'e_signature' then
    raise exception 'Only an e-signed agreement is approved in two halves — a paper one is corrected by replacing the scan.';
  end if;

  -- Nothing to take back is worth saying, rather than silently doing nothing
  -- and leaving staff to wonder whether it worked.
  if p_kind = 'document' and v_agreement.document_status <> 'approved' then
    raise exception 'The signed agreement is not approved, so there is nothing to undo.';
  end if;
  if p_kind = 'video' and v_agreement.video_status <> 'approved' then
    raise exception 'The consent video is not approved, so there is nothing to undo.';
  end if;
  if p_kind = 'both'
     and v_agreement.document_status <> 'approved'
     and v_agreement.video_status <> 'approved' then
    raise exception 'Neither half is approved, so there is nothing to undo.';
  end if;

  update agreements
     set document_status = case when p_kind in ('document', 'both') then 'pending' else document_status end,
         video_status = case when p_kind in ('video', 'both') then 'pending' else video_status end,
         -- A review note belongs to a rejection. Carrying one into a pending
         -- state would show the student a complaint about something nobody
         -- has asked them to change.
         document_review_note = case when p_kind in ('document', 'both') then null else document_review_note end,
         video_review_note = case when p_kind in ('video', 'both') then null else video_review_note end,
         -- Back to awaiting verification. The files stay attached, so the
         -- student is not asked to upload anything again; the submission is
         -- simply unapproved.
         status = case when status = 'signed' then 'pending_signature' else status end,
         approval_undone_at = now(),
         approval_undone_by = auth.uid(),
         approval_undo_note = v_note
   where id = p_agreement_id;
end; $$;

grant execute on function undo_agreement_approval(uuid, text, text) to authenticated;

-- Re-approving clears the undo, so the fields only ever describe a live
-- situation. verifySignedAgreement writes through the table rather than a
-- function, so this is a trigger rather than a line in that action — it then
-- holds however the approval is written.
create or replace function clear_agreement_undo_on_approval() returns trigger
language plpgsql as $$
begin
  if new.document_status = 'approved' and new.video_status = 'approved' then
    new.approval_undone_at := null;
    new.approval_undone_by := null;
    new.approval_undo_note := null;
  end if;
  return new;
end; $$;

drop trigger if exists trg_clear_agreement_undo_on_approval on agreements;
create trigger trg_clear_agreement_undo_on_approval
  before update on agreements
  for each row execute function clear_agreement_undo_on_approval();
