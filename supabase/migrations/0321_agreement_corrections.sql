-- Correcting a signed agreement (Super Admin), invoice or no invoice.
--
-- 1. Deleting an agreement no longer fails because an invoice was raised on
--    it. invoices.agreement_id refused the delete outright (no ON DELETE), so
--    an agreement signed with a wrong fee could neither be corrected nor
--    replaced once Finance had invoiced it. The invoice stays — it carries its
--    own figures — and simply no longer points at the deleted agreement.
--
-- 2. remove_signed_agreement: takes the signed copy off an agreement, so it
--    can be corrected (Edit is offered only while it is unsigned), its PDF
--    regenerated, and signed again — in the portal, on paper, or uploaded.
--    The copy is archived, not deleted (agreement_submission_archive, as a
--    "send back" does), the reason is shown to the student as a send-back's
--    is, and for an e-signature agreement the consent video goes with it
--    unless kept: a corrected agreement is a new thing to consent to.

do $$
begin
  if to_regclass('public.agreement_submission_archive') is null then
    raise exception '0321: agreement_submission_archive (0122) is missing';
  end if;
  if to_regprocedure('public.staff_has_permission(text)') is null then
    raise exception '0321: staff_has_permission (0248) is missing';
  end if;
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'agreements' and column_name = 'approval_undo_note'
  ) then
    raise exception '0321: agreements.approval_undo_note (0160) is missing';
  end if;
end $$;

-- 1 --------------------------------------------------- invoices keep standing
do $$
declare
  v_name text;
begin
  select conname into v_name
  from pg_constraint
  where conrelid = 'public.invoices'::regclass and contype = 'f' and confrelid = 'public.agreements'::regclass;
  if v_name is not null then
    execute format('alter table public.invoices drop constraint %I', v_name);
  end if;
end $$;

alter table public.invoices
  add constraint invoices_agreement_id_fkey foreign key (agreement_id) references public.agreements (id) on delete set null;

-- 2 ------------------------------------------------- the signed copy removed
create or replace function public.remove_signed_agreement(p_agreement_id uuid, p_reason text, p_with_video boolean default true)
returns void
language plpgsql security definer set search_path = public as $$
declare
  a record;
  v_video boolean;
begin
  if not public.staff_has_permission('agreements.edit_delete') then
    raise exception 'Only a Super Admin can remove a signed agreement.';
  end if;
  if coalesce(btrim(p_reason), '') = '' then
    raise exception 'Say why — the student is shown it, so they know what changed and what to sign.';
  end if;

  select id, signed_file_path, video_recording_path, signing_method into a
  from agreements where id = p_agreement_id for update;
  if a.id is null then
    raise exception 'That agreement no longer exists.';
  end if;
  if a.signed_file_path is null then
    raise exception 'There is no signed copy on this agreement to remove.';
  end if;
  v_video := p_with_video and a.signing_method = 'e_signature' and a.video_recording_path is not null;

  insert into agreement_submission_archive (agreement_id, kind, file_path, reason, archived_by)
  values (a.id, 'document', a.signed_file_path, p_reason, auth.uid());
  if v_video then
    insert into agreement_submission_archive (agreement_id, kind, file_path, reason, archived_by)
    values (a.id, 'video', a.video_recording_path, p_reason, auth.uid());
  end if;

  update agreements set
    signed_file_path = null,
    signed_file_uploaded_at = null,
    -- An e-signer reads why on their agreement page, as after a send-back.
    -- A paper one is back where any unsigned agreement starts.
    document_status = case when signing_method = 'e_signature' then 'rejected' else 'pending' end,
    document_review_note = case when signing_method = 'e_signature' then p_reason else null end,
    video_recording_path = case when v_video then null else video_recording_path end,
    video_uploaded_at = case when v_video then null else video_uploaded_at end,
    video_status = case when v_video then 'rejected' else video_status end,
    video_review_note = case when v_video then p_reason else video_review_note end,
    status = 'pending_signature',
    email_verified = false,
    reviewed_at = now(),
    reviewed_by = auth.uid(),
    approval_undone_at = null,
    approval_undone_by = null,
    approval_undo_note = null
  where id = a.id;
end;
$$;

revoke execute on function public.remove_signed_agreement(uuid, text, boolean) from public, anon;
grant execute on function public.remove_signed_agreement(uuid, text, boolean) to authenticated;
