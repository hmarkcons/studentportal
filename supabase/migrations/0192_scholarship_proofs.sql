-- Evidence that a scholarship application was actually submitted.
--
-- A regional agency gives you a receipt, a protocol number, an ISEE
-- acknowledgement — several files per application, and the office needs them
-- on file because a disputed application is argued with the receipt. Until now
-- there was nowhere to put them: the scholarship tab held the application's
-- status and amount and nothing else.
--
-- A table of its own rather than student_documents rows. student_documents is
-- a checklist — one row per requirement, with a review state and a rejection
-- reason — and these are not requirements anybody asks the student for. They
-- are evidence staff attach after the fact, several at a time, with nothing to
-- approve. Bending the checklist to hold them would mean a fake requirement
-- per file.
--
-- Attached to the scholarship application rather than to the student, so a
-- student applying to two bodies keeps the two sets of evidence apart.

create table if not exists public.scholarship_proofs (
  id uuid primary key default gen_random_uuid(),
  scholarship_id uuid not null references public.student_scholarships (id) on delete cascade,
  file_path text not null,
  file_name text not null,
  file_size integer,
  uploaded_by uuid references public.staff (id),
  uploaded_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists scholarship_proofs_scholarship_idx
  on public.scholarship_proofs (scholarship_id, uploaded_at desc);

-- The same file cannot be attached twice to one application.
create unique index if not exists scholarship_proofs_one_per_path
  on public.scholarship_proofs (scholarship_id, file_path);

alter table public.scholarship_proofs enable row level security;

-- Readable by staff who can see the student, and by the student themselves —
-- it is their own application and their own receipt.
drop policy if exists scholarship_proofs_select on public.scholarship_proofs;
create policy scholarship_proofs_select on public.scholarship_proofs
  for select using (
    exists (
      select 1 from public.student_scholarships s
      where s.id = scholarship_proofs.scholarship_id
        and (is_own_student(s.student_id) or staff_can_view_student(s.student_id))
    )
  );

-- Attaching and removing evidence is staff work, gated in the app by
-- scholarships.manage as the rest of this tab is.
drop policy if exists scholarship_proofs_write on public.scholarship_proofs;
create policy scholarship_proofs_write on public.scholarship_proofs
  for all
  using (
    has_role(array['counselor', 'processing', 'management', 'super_admin']::staff_role[])
    and exists (
      select 1 from public.student_scholarships s
      where s.id = scholarship_proofs.scholarship_id and staff_can_view_student(s.student_id)
    )
  )
  with check (
    has_role(array['counselor', 'processing', 'management', 'super_admin']::staff_role[])
    and exists (
      select 1 from public.student_scholarships s
      where s.id = scholarship_proofs.scholarship_id and staff_can_view_student(s.student_id)
    )
  );
