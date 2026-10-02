-- The current remark on a lead, where only staff can read it.
--
-- 0306 mirrored a lead's newest remark onto leads itself (remarks,
-- remarks_updated_at, remarks_updated_by). But a student can read their own
-- leads row (leads_select_self, 0022) — so the counsellor's note about them
-- would have been readable from the student's own session. It moves to a
-- table of its own, lead_remark_current, which only staff can read: one row
-- per lead, embedded in the leads list's query as before, so the list still
-- reads it in one round trip and never has to sift through every version.
--
-- Who may read and write a remark is also corrected. 0306 used
-- staff_can_view_student, which leaves out the marketing roles — and they can
-- open leads (leads_select), and do much of the lead work. It is now: a
-- member of active staff who can see the lead. The lead's visibility is
-- leads_select's own, applied to whoever is asking; is_active_staff() keeps a
-- student out even of their own lead's remarks.
--
-- Nothing had written a remark when this ran — the app that writes them
-- shipped with it — but whatever 0306 holds is carried across.
--
-- Safe to run again.

do $$
begin
  if to_regclass('public.lead_remarks') is null then
    raise exception '0307: lead_remarks (0306) is missing — apply 0306 first';
  end if;
end $$;

-- ------------------------------------------------- the current remark, staff-only
create table if not exists public.lead_remark_current (
  lead_id uuid primary key references public.leads (id) on delete cascade,
  -- Null when the newest version cleared it: still a row, so "last edited by"
  -- has somewhere to live.
  body text,
  updated_at timestamptz not null,
  updated_by uuid references public.staff (id) on delete set null
);
comment on table public.lead_remark_current is
  'Each lead''s current remark — its newest lead_remarks version, written only by that table''s trigger. Staff-only, unlike leads, which a student can read for themselves (0307).';

alter table public.lead_remark_current enable row level security;
drop policy if exists lead_remark_current_select on public.lead_remark_current;
create policy lead_remark_current_select on public.lead_remark_current for select
  using (is_active_staff() and exists (select 1 from public.leads l where l.id = lead_id));
-- No write policy: only the trigger writes it.

-- ------------------------------------------------------- versions: who
drop policy if exists lead_remarks_select on public.lead_remarks;
create policy lead_remarks_select on public.lead_remarks for select
  using (is_active_staff() and exists (select 1 from public.leads l where l.id = lead_id));

drop policy if exists lead_remarks_insert on public.lead_remarks;
create policy lead_remarks_insert on public.lead_remarks for insert
  with check (is_active_staff() and written_by = auth.uid() and exists (select 1 from public.leads l where l.id = lead_id));

-- ------------------------------------------------------------ the mirror
create or replace function public.lead_remarks_mirror()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into lead_remark_current (lead_id, body, updated_at, updated_by)
  values (new.lead_id, nullif(btrim(new.body), ''), new.created_at, new.written_by)
  on conflict (lead_id) do update
    set body = excluded.body, updated_at = excluded.updated_at, updated_by = excluded.updated_by
    -- A version written out of order never overtakes a newer one.
    where lead_remark_current.updated_at <= excluded.updated_at;
  return null;
end;
$$;

-- What 0306 mirrored onto leads, carried across, then taken off leads.
insert into public.lead_remark_current (lead_id, body, updated_at, updated_by)
select distinct on (r.lead_id) r.lead_id, nullif(btrim(r.body), ''), r.created_at, r.written_by
from public.lead_remarks r
order by r.lead_id, r.created_at desc
on conflict (lead_id) do nothing;

drop trigger if exists trg_leads_remarks_guard on public.leads;
drop function if exists public.leads_remarks_guard();
alter table public.leads
  drop column if exists remarks,
  drop column if exists remarks_updated_at,
  drop column if exists remarks_updated_by;

do $$
declare
  n int;
begin
  select count(*) into n from information_schema.columns
  where table_schema = 'public' and table_name = 'leads' and column_name like 'remarks%';
  if n > 0 then raise exception '0307: leads still has % remarks columns', n; end if;
  if to_regclass('public.lead_remark_current') is null then raise exception '0307: lead_remark_current was not created'; end if;
end $$;

notify pgrst, 'reload schema';
