-- Staff agreements: templates for them, agreements generated from those
-- templates, signed copies uploaded or returned by the staff member.
--
-- ------------------------------------------------------------- access
--
-- Two permissions, both with NO default roles — so today they are a Super
-- Admin's alone (staff_has_permission() answers true for a Super Admin
-- whatever the table says), and the Role Permissions screen can grant either
-- to any role later without a code change:
--
--   staff_agreements.templates  the wording of staff contracts
--   staff_agreements.manage     generating, uploading, sending, verifying
--
-- Split because they are different kinds of trust: HR can be let issue and
-- file contracts without being able to rewrite what the contract says.
--
-- --------------------------------------------------- why tables of their own
--
-- Not new rows in agreement_templates / agreements. agreement_templates is
-- readable by every active staff member (0010: is_active_staff()), which is
-- right for student templates everyone generates from, and wrong for a staff
-- contract that states salary. agreements is keyed to a student and hedged
-- about with student-portal rules that have nothing to do with staff. Mixing
-- the two would make every existing policy on them a question about staff
-- contracts too.
--
-- ------------------------------------------------------------ the lifecycle
--
--   draft               generated, not yet shown to the staff member
--   awaiting_signature  sent to them; they sign and return it in the portal
--   submitted           they returned a signed copy; waiting to be verified
--   signed              verified, or uploaded signed by the office directly
--
-- A staff member sees their own agreement from awaiting_signature onward —
-- never a draft — and returns a signed copy through submit_staff_agreement(),
-- which is the only write they are allowed.
--
-- Refuses to run if what it builds on is missing.

do $$
begin
  if to_regprocedure('public.staff_has_permission(text)') is null then
    raise exception '0271: public.staff_has_permission(text) is missing (0095) — nothing to authorise with';
  end if;
  if to_regprocedure('public.set_updated_at()') is null then
    raise exception '0271: public.set_updated_at() is missing — nothing to stamp updated_at with';
  end if;
end $$;

-- ------------------------------------------------------------ permissions

insert into public.permission_definitions (key, category, label, description, default_roles, sort_order) values
  ('staff_agreements.templates', 'Staff & HR', 'Manage staff agreement templates',
   'Create, edit and delete the wording of staff employment agreements.',
   array[]::staff_role[], 40),
  ('staff_agreements.manage', 'Staff & HR', 'Generate and upload staff agreements',
   'Generate staff agreements from a template, upload signed copies, send them to staff to sign and verify what they return. Agreements can state pay, so this shows salary and commission terms.',
   array[]::staff_role[], 41)
on conflict (key) do nothing;

-- -------------------------------------------------------------- templates

create table if not exists public.staff_agreement_templates (
  id uuid primary key default gen_random_uuid(),
  name text not null check (btrim(name) <> ''),
  -- The one authorised person who signs for HMARK, as on student templates.
  signatory_name text not null check (btrim(signatory_name) <> ''),
  wording text not null default '',
  -- The .docx the wording was imported from, kept for reference.
  file_path text,
  created_by uuid references public.staff (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists trg_staff_agreement_templates_updated_at on public.staff_agreement_templates;
create trigger trg_staff_agreement_templates_updated_at
  before update on public.staff_agreement_templates
  for each row execute function public.set_updated_at();

alter table public.staff_agreement_templates enable row level security;

-- Whoever generates needs to read the templates to pick one.
drop policy if exists "staff_agreement_templates_select" on public.staff_agreement_templates;
create policy "staff_agreement_templates_select" on public.staff_agreement_templates for select
  using (public.staff_has_permission('staff_agreements.templates') or public.staff_has_permission('staff_agreements.manage'));

drop policy if exists "staff_agreement_templates_write" on public.staff_agreement_templates;
create policy "staff_agreement_templates_write" on public.staff_agreement_templates for all
  using (public.staff_has_permission('staff_agreements.templates'))
  with check (public.staff_has_permission('staff_agreements.templates'));

-- ------------------------------------------------------------- agreements

create table if not exists public.staff_agreements (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid not null references public.staff (id) on delete cascade,
  -- Kept after the template is deleted: the agreement stands on its own PDF.
  template_id uuid references public.staff_agreement_templates (id) on delete set null,
  title text not null check (btrim(title) <> ''),
  status text not null default 'draft'
    check (status in ('draft', 'awaiting_signature', 'submitted', 'signed')),
  -- generated from a template, or an agreement signed outside the portal and uploaded as it is
  source text not null default 'generated' check (source in ('generated', 'uploaded')),
  pdf_path text,
  signed_file_path text,
  -- Why a returned copy was sent back; cleared when they return another.
  rejection_note text,
  generated_by uuid references public.staff (id) on delete set null,
  sent_at timestamptz,
  submitted_at timestamptz,
  verified_by uuid references public.staff (id) on delete set null,
  verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- A signed agreement has the signed document on file, whichever way it came.
  constraint staff_agreements_signed_has_file check (status <> 'signed' or signed_file_path is not null),
  constraint staff_agreements_submitted_has_file check (status <> 'submitted' or signed_file_path is not null)
);

create index if not exists staff_agreements_staff_idx on public.staff_agreements (staff_id, created_at desc);

drop trigger if exists trg_staff_agreements_updated_at on public.staff_agreements;
create trigger trg_staff_agreements_updated_at
  before update on public.staff_agreements
  for each row execute function public.set_updated_at();

alter table public.staff_agreements enable row level security;

drop policy if exists "staff_agreements_select" on public.staff_agreements;
create policy "staff_agreements_select" on public.staff_agreements for select
  using (
    public.staff_has_permission('staff_agreements.manage')
    or (staff_id = auth.uid() and status <> 'draft')
  );

drop policy if exists "staff_agreements_write" on public.staff_agreements;
create policy "staff_agreements_write" on public.staff_agreements for all
  using (public.staff_has_permission('staff_agreements.manage'))
  with check (public.staff_has_permission('staff_agreements.manage'));

-- The staff member's one write: returning a signed copy of an agreement sent
-- to them. Only their own, only while it is waiting for them, and only a file
-- in their own folder — so it can neither sign someone else's agreement nor
-- point at a document they did not upload.
create or replace function public.submit_staff_agreement(p_agreement_id uuid, p_signed_path text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_updated integer;
begin
  if p_signed_path is null or p_signed_path not like ('staff-agreements/' || auth.uid()::text || '/%') then
    raise exception 'That file is not in your own folder.';
  end if;

  update public.staff_agreements
    set status = 'submitted',
        signed_file_path = p_signed_path,
        submitted_at = now(),
        rejection_note = null
    where id = p_agreement_id
      and staff_id = auth.uid()
      and status = 'awaiting_signature';
  get diagnostics v_updated = row_count;

  if v_updated = 0 then
    raise exception 'This agreement is not waiting for your signature.';
  end if;
end;
$$;

revoke all on function public.submit_staff_agreement(uuid, text) from public, anon;
grant execute on function public.submit_staff_agreement(uuid, text) to authenticated;

-- ---------------------------------------------------------------- storage
--
-- Two top-level folders of the documents bucket, the same carve-out pattern
-- as staff-photos (0100). Nothing else matches them: every other policy there
-- keys on a student, a commission or a partner id in the first segment, and a
-- folder name is none of those.

drop policy if exists "documents_storage_staff_agreement_templates_select" on storage.objects;
create policy "documents_storage_staff_agreement_templates_select" on storage.objects for select
  using (
    bucket_id = 'documents'
    and (storage.foldername(name))[1] = 'staff-agreement-templates'
    and (public.staff_has_permission('staff_agreements.templates') or public.staff_has_permission('staff_agreements.manage'))
  );

drop policy if exists "documents_storage_staff_agreement_templates_write" on storage.objects;
create policy "documents_storage_staff_agreement_templates_write" on storage.objects for all
  using (
    bucket_id = 'documents'
    and (storage.foldername(name))[1] = 'staff-agreement-templates'
    and public.staff_has_permission('staff_agreements.templates')
  )
  with check (
    bucket_id = 'documents'
    and (storage.foldername(name))[1] = 'staff-agreement-templates'
    and public.staff_has_permission('staff_agreements.templates')
  );

-- staff-agreements/<staff id>/…
drop policy if exists "documents_storage_staff_agreements_manage" on storage.objects;
create policy "documents_storage_staff_agreements_manage" on storage.objects for all
  using (
    bucket_id = 'documents'
    and (storage.foldername(name))[1] = 'staff-agreements'
    and public.staff_has_permission('staff_agreements.manage')
  )
  with check (
    bucket_id = 'documents'
    and (storage.foldername(name))[1] = 'staff-agreements'
    and public.staff_has_permission('staff_agreements.manage')
  );

-- A staff member reads only the files of their own agreements that have been
-- sent to them — not every object in their folder, which would include the
-- PDF of a draft nobody has shown them yet.
drop policy if exists "documents_storage_staff_agreements_own_select" on storage.objects;
create policy "documents_storage_staff_agreements_own_select" on storage.objects for select
  using (
    bucket_id = 'documents'
    and (storage.foldername(name))[1] = 'staff-agreements'
    and (storage.foldername(name))[2] = auth.uid()::text
    and exists (
      select 1 from public.staff_agreements a
      where a.staff_id = auth.uid()
        and a.status <> 'draft'
        and (a.pdf_path = name or a.signed_file_path = name)
    )
  );

-- …and may add their signed copy to their own folder, and nothing else: no
-- update, no delete, so what they returned stays as they returned it.
drop policy if exists "documents_storage_staff_agreements_own_insert" on storage.objects;
create policy "documents_storage_staff_agreements_own_insert" on storage.objects for insert
  with check (
    bucket_id = 'documents'
    and (storage.foldername(name))[1] = 'staff-agreements'
    and (storage.foldername(name))[2] = auth.uid()::text
    and (storage.foldername(name))[3] = 'returned'
    and exists (
      select 1 from public.staff_agreements a
      where a.staff_id = auth.uid() and a.status = 'awaiting_signature'
    )
  );
