-- Record when each agreement artefact arrived, and let a university see the
-- interviews and the upload times on its own applications.
--
-- Everything else the brief asks for was already recorded and merely never
-- shown: student_documents keeps uploaded_at, uploaded_by_role and verified_at;
-- application_interviews and partner_documents keep created_at. Two real gaps
-- remain, and this closes them.

-- ------------------------------------------------- agreement upload times
-- agreements has created_at and an updated_at trigger, so the only timestamp on
-- a signed agreement moves whenever anything about the row changes — including
-- a staff member approving it. It therefore cannot answer "when did the student
-- send this in", which is the question a dispute over a missed deadline turns
-- on. Each artefact gets its own stamp: the document and the video are uploaded,
-- rejected and replaced independently (0122, 0124), so one shared timestamp
-- would be wrong for whichever half had not just changed.
alter table public.agreements add column if not exists signed_file_uploaded_at timestamptz;
alter table public.agreements add column if not exists video_uploaded_at timestamptz;

comment on column public.agreements.signed_file_uploaded_at is
  'When the signed agreement now on file was uploaded (by the student from the portal, or by staff for a paper signing).';
comment on column public.agreements.video_uploaded_at is
  'When the consent video now on file was uploaded.';

-- Rows that predate this get the best available approximation rather than a
-- null that would read as "never uploaded". updated_at is the last time
-- anything about the agreement changed, which for an already-signed agreement
-- is at or after the upload — so the stamp is honest about being an upper
-- bound, and the app labels a backfilled value no differently because it
-- cannot tell. Only rows that actually hold a file are touched.
update public.agreements
   set signed_file_uploaded_at = coalesce(updated_at, created_at)
 where signed_file_path is not null and signed_file_uploaded_at is null;
update public.agreements
   set video_uploaded_at = coalesce(updated_at, created_at)
 where video_recording_path is not null and video_uploaded_at is null;

-- The student-side submit RPC, carried forward from 0124 with the stamps added.
-- Each half is stamped only when that half is actually being replaced, matching
-- how 0124 already treats status and review notes.
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
         video_review_note     = case when v_new_video is not null then null else video_review_note end,
         signed_file_uploaded_at = case when v_new_doc   is not null then now() else signed_file_uploaded_at end,
         video_uploaded_at       = case when v_new_video is not null then now() else video_uploaded_at end
   where id = p_agreement_id;
end; $$;

grant execute on function student_submit_signed_agreement(uuid, text, text) to authenticated;

-- --------------------------------------- document uploads always stamped
-- student_documents.uploaded_at has no default, so it is only right if every
-- writer remembers it. Two of the three did: the staff path and the student
-- path set it, and the university's offer-letter upload did not — so the one
-- document that arrives from outside HMARK was also the one nobody could date.
-- The action is fixed, and this trigger makes the guarantee structural rather
-- than a convention three call sites have to keep.
--
-- Only fires when a file actually appears or changes, and never overwrites a
-- value the caller supplied, so a backdated import can still say what it means.
create or replace function set_document_uploaded_at() returns trigger
language plpgsql as $$
begin
  if new.file_path is not null
     and (tg_op = 'INSERT' or new.file_path is distinct from old.file_path)
     and new.uploaded_at is null then
    new.uploaded_at := now();
  end if;
  return new;
end;
$$;

drop trigger if exists trg_student_documents_uploaded_at on public.student_documents;
create trigger trg_student_documents_uploaded_at
  before insert or update on public.student_documents
  for each row execute function set_document_uploaded_at();

-- The rows that went in without one. These are all insert-created (a university
-- offer letter is inserted at the moment it is uploaded), so created_at is the
-- upload time rather than an approximation of it.
update public.student_documents
   set uploaded_at = created_at
 where file_path is not null and uploaded_at is null;

-- Rejecting an artefact clears its path (0122), so the stamp has to go with it
-- — an "Uploaded 3 Sep" line sitting next to a file that is no longer there
-- would be worse than no line at all. Carried forward from 0122 unchanged
-- apart from the two new columns.
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
           signed_file_uploaded_at = null,
           document_status = 'rejected',
           document_review_note = p_reason,
           status = case when status = 'signed' then 'pending_signature' else status end,
           reviewed_at = now(),
           reviewed_by = auth.uid()
     where id = p_agreement_id;
  else
    update agreements
       set video_recording_path = null,
           video_uploaded_at = null,
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

-- ------------------------------------------- what a university can see
-- The brief asks for these times to be visible to the university as well as to
-- staff and the student. A university could not read an interview at all: the
-- select policy from 0088 names staff and the student only, so the party that
-- actually runs the interview had no sight of the schedule.
--
-- The credentials stay where they are. They live in their own table precisely
-- because row-level security gates rows and not columns (0151), and no partner
-- clause is added there — a university issues the login, it does not need to
-- read back what HMARK stored for the student.
drop policy if exists application_interviews_select on public.application_interviews;
create policy application_interviews_select on public.application_interviews
  for select using (
    exists (
      select 1 from public.applications a
      where a.id = application_interviews.application_id
        and (
          staff_can_view_student(a.student_id)
          or is_own_student(a.student_id)
          or a.university_id = partner_university_id()
        )
    )
  );

-- --------------------------------------- upload times on the partner list
-- documents_summary was jsonb_object_agg(category, status): a map keyed by
-- category, so two documents in the same category silently collapsed into
-- whichever row aggregated last, and a university reading "other: pending" had
-- no idea it stood for three files. It also carried no name for a custom
-- requirement and no timestamps at all.
--
-- An array of objects fixes all three. Ordered oldest first, so the list reads
-- in the order the documents arrived.
drop function if exists get_partner_applications();

create or replace function get_partner_applications() returns table (
  application_id uuid,
  student_name text,
  program_name text,
  intake text,
  current_stage text,
  pipeline_stages jsonb,
  submitted_at timestamptz,
  application_deadline date,
  student_email text,
  student_phone text,
  documents_summary jsonb
) language plpgsql security definer as $$
declare
  v_uni uuid;
  v_mode text;
begin
  v_uni := partner_university_id();
  if v_uni is null then
    return;
  end if;
  select u.student_visibility_mode into v_mode from universities u where u.id = v_uni;

  return query
  select
    a.id,
    l.full_name,
    p.name,
    a.intake,
    a.current_stage,
    d.pipeline_stages,
    a.created_at,
    p.application_deadline,
    case when v_mode = 'full' then l.email else null end,
    case when v_mode = 'full' then l.contact_number else null end,
    (
      select jsonb_agg(
               jsonb_build_object(
                 'name', coalesce(nullif(btrim(sd.custom_name), ''), t.name, replace(coalesce(sd.category, 'other'), '_', ' ')),
                 'status', sd.status,
                 'uploaded_at', sd.uploaded_at,
                 'uploaded_by_role', sd.uploaded_by_role,
                 'verified_at', sd.verified_at
               )
               -- Unfilled requirements sort to the end: they have no upload
               -- time, and putting them at the top with the oldest documents
               -- would read as though they were the first to arrive.
               order by coalesce(sd.uploaded_at, 'infinity'::timestamptz), sd.id
             )
      from student_documents sd
      left join document_templates t on t.id = sd.template_id
      where sd.application_id = a.id
    )
  from applications a
  join leads l on l.id = a.student_id
  join universities u2 on u2.id = a.university_id
  join destinations d on d.id = u2.destination_id
  left join programs p on p.id = a.program_id
  where a.university_id = v_uni;
end;
$$;

grant execute on function get_partner_applications() to authenticated;
