-- Close the student's portal when the agreement that justified it is deleted.
--
-- Nothing wrote portal_active = false except a deliberate Suspend, and no
-- trigger fired on delete at all — so removing a student's only signed
-- agreement left them with a fully open portal and nothing on file. The rule
-- the product states is the opposite: the account stays inactive until a
-- signed agreement is uploaded.
--
-- Reached by the ordinary correction: staff delete an agreement generated with
-- the wrong template or the wrong fee, meaning to regenerate it. Between the
-- two the student had access they had no basis for.
--
-- ---------------------------------------------------------------------------
-- One predicate, both directions
-- ---------------------------------------------------------------------------
-- The condition for opening the portal lived inline in
-- activate_student_portal_for_agreement (0253). Writing it out a second time
-- here is how the two rules drift apart — the same shape of bug as a
-- commission booked on one signing path and not the other. So it is extracted
-- once and both triggers call it.
create or replace function public.agreement_justifies_portal(
  p_status text,
  p_signing_method text,
  p_signed_file_path text
) returns boolean
language sql immutable as $$
  select
    -- Signed and on file: full access, either signing method.
    (p_status = 'signed' and p_signed_file_path is not null)
    -- Outstanding e-signature: the student submits it from inside the portal,
    -- so the door has to be open for them to do it. portalGate holds them to
    -- the agreement page, their payments and Support until it is done.
    or (p_signing_method = 'e_signature' and p_status is distinct from 'signed');
$$;

comment on function public.agreement_justifies_portal(text, text, text) is
  'Whether one agreement is reason enough for the student portal to be open. '
  'Called by trg_activate_student_portal to open it and by trg_close_student_portal to close it.';

-- Unchanged in behaviour — the inline condition is now the shared predicate.
create or replace function public.activate_student_portal_for_agreement() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if agreement_justifies_portal(new.status, new.signing_method, new.signed_file_path) then
    update leads set portal_active = true where id = new.student_id and portal_active = false;
  end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Closing it
-- ---------------------------------------------------------------------------
-- Per student, not per agreement: a student may hold one agreement for their
-- primary country and another for a backup, and deleting one must not close a
-- portal the other still justifies.
--
-- Only the delete side closes. Making the insert/update trigger symmetric
-- would read better and behave worse: rejecting the document on a paper
-- agreement nulls signed_file_path and puts the status back to
-- pending_signature, which would throw the student out of their portal in the
-- middle of a correction nobody asked them to make.
--
-- The login is left alone, as Suspend leaves it. Nothing is destroyed here and
-- a Super Admin can re-activate in one click.
create or replace function public.close_student_portal_on_agreement_delete() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if not exists (
    select 1
      from agreements a
     where a.student_id = old.student_id
       and agreement_justifies_portal(a.status, a.signing_method, a.signed_file_path)
  ) then
    -- No-op when the student row is on its way out too (a lead delete cascades
    -- to their agreements), and when the portal is already shut.
    update leads set portal_active = false
     where id = old.student_id and portal_active = true;
  end if;
  return old;
end;
$$;

drop trigger if exists trg_close_student_portal on public.agreements;
create trigger trg_close_student_portal
  after delete on public.agreements
  for each row execute function public.close_student_portal_on_agreement_delete();

-- Anyone already left open by a deletion that predates this. There are no
-- agreements in the system today, so this is expected to match nothing beyond
-- students who never had one — which is why it is restricted to those with an
-- actual portal login, rather than flipping a default-false column on every
-- lead that was never a student.
update public.leads l
   set portal_active = false
 where l.portal_active = true
   and l.auth_user_id is not null
   and not exists (
     select 1
       from public.agreements a
      where a.student_id = l.id
        and public.agreement_justifies_portal(a.status, a.signing_method, a.signed_file_path)
   );
