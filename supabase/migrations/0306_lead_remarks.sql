-- A remark on each lead, with every version kept.
--
-- Superseded in part by 0307: the current remark lives in lead_remark_current,
-- staff-only, not on leads (which a student can read for themselves), and who
-- may read and write one is any active staff member who can see the lead.
--
-- The leads list gets a Remarks column, before Follow-up: the counsellor's own
-- note on the lead ("Wants Italy, budget tight, call after Eid"), separate
-- from the remark a status change asks for (lead_call_logs) and from the
-- follow-up notes (reminders). A long one is shortened in the list and shown
-- whole in a pop-up, where it is edited; it is also on the lead's own page, in
-- the leads export, and read from a "remarks" column by the leads import.
--
-- Every version is kept: lead_remarks holds each one, who wrote it and when,
-- and is never updated or deleted — an edit is a new row. The newest is
-- mirrored onto leads (remarks, remarks_updated_at, remarks_updated_by) so the
-- list reads it with the lead, in the same query, rather than in a second
-- round trip to Sydney for every page of leads.
--
-- The mirror is written only from lead_remarks. A change to leads.remarks made
-- any other way — an edit form, an import writing the column — would change
-- what shows without a version behind it, so it is refused.
--
-- Who: whoever can open the lead (staff_can_view_student — its counsellor,
-- Management, Processing, Finance, Super Admin), as for the lead's other
-- details. Students never read these.
--
-- Safe to run again.

do $$
begin
  if to_regprocedure('public.staff_can_view_student(uuid)') is null then
    raise exception '0306: staff_can_view_student is missing';
  end if;
end $$;

create table if not exists public.lead_remarks (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.leads (id) on delete cascade,
  -- Empty is allowed: it is how a remark is cleared, and the clearing is a
  -- version like any other.
  body text not null check (char_length(body) <= 4000),
  written_by uuid default auth.uid() references public.staff (id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists lead_remarks_lead_idx on public.lead_remarks (lead_id, created_at desc);
comment on table public.lead_remarks is
  'Every version of the remark on a lead, newest last; never updated or deleted — an edit is a new row (0306). The newest is mirrored onto leads.remarks.';

alter table public.leads
  add column if not exists remarks text,
  add column if not exists remarks_updated_at timestamptz,
  add column if not exists remarks_updated_by uuid references public.staff (id) on delete set null;
comment on column public.leads.remarks is
  'The lead''s current remark — a mirror of its newest lead_remarks row, written only by that table''s trigger (0306).';

-- ------------------------------------------------------------------ RLS
alter table public.lead_remarks enable row level security;

drop policy if exists lead_remarks_select on public.lead_remarks;
create policy lead_remarks_select on public.lead_remarks for select
  using (staff_can_view_student(lead_id));

-- Written as oneself: the history says who wrote each version, so it cannot
-- be written in somebody else's name.
drop policy if exists lead_remarks_insert on public.lead_remarks;
create policy lead_remarks_insert on public.lead_remarks for insert
  with check (staff_can_view_student(lead_id) and written_by = auth.uid());
-- No update or delete policy: a version, once written, stays.

-- ------------------------------------------------------------- the mirror
-- SECURITY DEFINER for the same reason as sync_program_first_round (0232):
-- whoever may write a remark must have it shown, whatever their own UPDATE
-- rights on leads.
create or replace function public.lead_remarks_mirror()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform set_config('app.lead_remarks_mirror', 'on', true);
  update leads
     set remarks = nullif(btrim(new.body), ''),
         remarks_updated_at = new.created_at,
         remarks_updated_by = new.written_by
   where id = new.lead_id;
  perform set_config('app.lead_remarks_mirror', 'off', true);
  return null;
end;
$$;

drop trigger if exists trg_lead_remarks_mirror on public.lead_remarks;
create trigger trg_lead_remarks_mirror
  after insert on public.lead_remarks
  for each row execute function public.lead_remarks_mirror();

-- The mirror only: any other change to it would show a remark with no version.
create or replace function public.leads_remarks_guard()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if coalesce(current_setting('app.lead_remarks_mirror', true), 'off') = 'on' then
    return new;
  end if;
  if tg_op = 'INSERT' then
    if new.remarks is not null or new.remarks_updated_at is not null or new.remarks_updated_by is not null then
      raise exception 'A lead''s remark is written by adding a version to lead_remarks, not to leads';
    end if;
  elsif new.remarks is distinct from old.remarks
     or new.remarks_updated_at is distinct from old.remarks_updated_at
     or new.remarks_updated_by is distinct from old.remarks_updated_by then
    raise exception 'A lead''s remark is written by adding a version to lead_remarks, not to leads';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_leads_remarks_guard on public.leads;
create trigger trg_leads_remarks_guard
  before insert or update on public.leads
  for each row execute function public.leads_remarks_guard();

do $$
begin
  if to_regclass('public.lead_remarks') is null then
    raise exception '0306: lead_remarks was not created';
  end if;
end $$;

notify pgrst, 'reload schema';
