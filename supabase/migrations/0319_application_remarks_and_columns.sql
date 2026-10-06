-- The applications table (staff): a remark on each application, and the
-- column order a Super Admin arranges.
--
-- 1. application_remarks: every version of the short note staff keep on an
--    application, newest last, never updated or deleted — an edit is a new
--    row — and application_remark_current, the newest, written only by the
--    trigger here. The same shape as the leads' remarks (0306, 0307), and
--    staff-only for the same reason: a student can read their own
--    applications rows, so a note about them must not live on that table.
--
-- 2. list_column_orders (0313) takes 'applications' as well as 'leads'.

do $$
begin
  if to_regclass('public.list_column_orders') is null then
    raise exception '0319: list_column_orders (0313) is missing';
  end if;
  if to_regprocedure('public.is_active_staff()') is null then
    raise exception '0319: is_active_staff() is missing';
  end if;
end $$;

-- 1 ----------------------------------------------------------------- remarks
create table if not exists public.application_remarks (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references public.applications (id) on delete cascade,
  -- Empty is allowed: it is how a remark is cleared, as a version of its own.
  body text not null check (char_length(body) <= 4000),
  written_by uuid default auth.uid() references public.staff (id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists application_remarks_app_idx on public.application_remarks (application_id, created_at desc);

comment on table public.application_remarks is
  'Every version of the staff remark on an application, newest last; never updated or deleted — an edit is a new row (0319).';

create table if not exists public.application_remark_current (
  application_id uuid primary key references public.applications (id) on delete cascade,
  body text,
  updated_at timestamptz not null,
  updated_by uuid references public.staff (id) on delete set null
);

comment on table public.application_remark_current is
  'Each application''s current remark — its newest application_remarks version, written only by that table''s trigger. Staff-only (0319).';

alter table public.application_remarks enable row level security;
alter table public.application_remark_current enable row level security;

-- Whoever on the staff can see the application, as RLS on applications decides.
drop policy if exists application_remarks_select on public.application_remarks;
create policy application_remarks_select on public.application_remarks for select
  using (public.is_active_staff() and exists (select 1 from public.applications a where a.id = application_id));
drop policy if exists application_remarks_insert on public.application_remarks;
create policy application_remarks_insert on public.application_remarks for insert
  with check (public.is_active_staff() and written_by = auth.uid() and exists (select 1 from public.applications a where a.id = application_id));
drop policy if exists application_remark_current_select on public.application_remark_current;
create policy application_remark_current_select on public.application_remark_current for select
  using (public.is_active_staff() and exists (select 1 from public.applications a where a.id = application_id));

revoke all on public.application_remarks, public.application_remark_current from anon;
grant select, insert on public.application_remarks to authenticated;
grant select on public.application_remark_current to authenticated;

create or replace function public.application_remarks_mirror()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into application_remark_current (application_id, body, updated_at, updated_by)
  values (new.application_id, nullif(btrim(new.body), ''), new.created_at, new.written_by)
  on conflict (application_id) do update
    set body = excluded.body, updated_at = excluded.updated_at, updated_by = excluded.updated_by
    -- A version written out of order never overtakes a newer one.
    where application_remark_current.updated_at <= excluded.updated_at;
  return null;
end;
$$;

drop trigger if exists trg_application_remarks_mirror on public.application_remarks;
create trigger trg_application_remarks_mirror
  after insert on public.application_remarks
  for each row execute function public.application_remarks_mirror();

-- 2 ------------------------------------------------------------ column order
alter table public.list_column_orders drop constraint if exists list_column_orders_list_key_check;
alter table public.list_column_orders
  add constraint list_column_orders_list_key_check check (list_key in ('leads', 'applications'));
