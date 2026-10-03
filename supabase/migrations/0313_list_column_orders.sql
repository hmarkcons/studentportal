-- The order a list's columns are shown in, arranged by a Super Admin for
-- everyone.
--
-- One row per list. 'leads' is the only list arranged so far: its order is
-- also the order of the leads Excel template and export, which mirror the
-- list column for column. column_keys holds the leads workbook's own keys
-- (src/lib/leadSheet.ts); the app ignores a key it does not know and puts a
-- column the order does not name at its default place, so the row never has
-- to be migrated when a column is added.
--
-- Every member of staff reads it; only a Super Admin writes it.

create table if not exists public.list_column_orders (
  list_key text primary key check (list_key in ('leads')),
  column_keys text[] not null check (cardinality(column_keys) between 1 and 60),
  updated_by uuid references public.staff (id) on delete set null default auth.uid(),
  updated_at timestamptz not null default now()
);

alter table public.list_column_orders enable row level security;

drop policy if exists "list_column_orders_select" on public.list_column_orders;
create policy "list_column_orders_select" on public.list_column_orders for select
  using (public.is_active_staff());

drop policy if exists "list_column_orders_write" on public.list_column_orders;
create policy "list_column_orders_write" on public.list_column_orders for all
  using (public.is_super_admin())
  with check (public.is_super_admin());

revoke all on public.list_column_orders from anon;
grant select, insert, update, delete on public.list_column_orders to authenticated;
