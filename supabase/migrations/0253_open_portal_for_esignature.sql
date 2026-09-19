-- Let an e-signature student actually reach the page they are asked to use.
--
-- The portal opened on one condition only: an agreement marked signed with a
-- scan on file. That is right for paper (Karachi) — the student hands the
-- signed copy over the counter and staff upload it, so the portal opens as
-- soon as it exists.
--
-- For e-signature (outside Karachi) it was a deadlock. The student is the one
-- who submits the signed document and the consent video, and they do that from
-- /portal/agreement — but the student layout sends anybody with
-- portal_active = false back to "/", so they never arrive. No submission, no
-- signed agreement; no signed agreement, no portal. activate_student_portal
-- (portal.ts) could not break the tie either: it refuses unless a signed
-- agreement already exists.
--
-- The rest of the system was already written for the state this could not
-- produce. portalGate.ts holds such a student to the agreement page, their
-- payments and support, and trims the menu to match; src/proxy.ts enforces it;
-- undo_agreement_approval deliberately leaves portal_active alone so a student
-- whose approval was taken back can still fix it. Every one of those assumes
-- the student is inside the portal with the gate down — which only happens
-- once the portal opens before signing.
--
-- So: an e-signature agreement opens the portal the moment it is generated,
-- gated. A paper one still opens nothing until the signed scan is uploaded.
--
-- Renamed, because the old name now describes half of what it does.
create or replace function public.activate_student_portal_for_agreement() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  -- Signed and on file: full access. Either signing method reaches this.
  if new.status = 'signed' and new.signed_file_path is not null then
    update leads set portal_active = true where id = new.student_id and portal_active = false;

  -- Not signed yet, and the student is the one who has to sign it. They need
  -- the door open to do that; portalGate keeps them to the agreement page,
  -- their payments and support until it is done.
  elsif new.signing_method = 'e_signature' then
    update leads set portal_active = true where id = new.student_id and portal_active = false;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_activate_student_portal on public.agreements;
drop function if exists public.activate_student_portal_on_signed_agreement();

create trigger trg_activate_student_portal
  after insert or update on public.agreements
  for each row execute function public.activate_student_portal_for_agreement();

-- Anyone already stuck behind the deadlock. There are no agreements in the
-- system today, so this is expected to match nothing — it is here so that
-- applying the fix to a database that does have some leaves no one stranded.
update public.leads l
   set portal_active = true
 where l.portal_active = false
   and exists (
     select 1 from public.agreements a
      where a.student_id = l.id
        and a.signing_method = 'e_signature'
        and a.status <> 'signed'
   );
