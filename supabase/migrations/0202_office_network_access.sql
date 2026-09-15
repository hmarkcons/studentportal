-- Signing in from outside the office needs somebody's permission.
--
-- The office network is an allow-list of addresses and ranges. On it, nothing
-- changes: staff sign in and stay signed in. Off it, a staff member reaches a
-- waiting screen and nothing else until Management or a Super Admin approves
-- them, and that approval lapses after a set number of days rather than
-- quietly becoming permanent.
--
-- Two safety properties are deliberate and load-bearing:
--
--   1. With no network configured the gate is OFF. Otherwise the day this
--      lands every staff member outside one unknown address is locked out of
--      a live system, which is a worse failure than the one it prevents.
--   2. A Super Admin is never gated. If the ISP changes the office address
--      overnight, somebody has to be able to get in and fix the list —
--      without this the office can lock itself out with no way back except
--      editing the database by hand.

-- ------------------------------------------------------ the office network
-- Stored as cidr so Postgres does the matching with <<=, which handles both
-- IPv4 and IPv6 and a single address (as /32 or /128) without any bit
-- arithmetic of ours to get wrong.
create table if not exists public.office_networks (
  id uuid primary key default gen_random_uuid(),
  label text not null,
  network cidr not null unique,
  note text,
  created_by uuid references public.staff (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.office_networks is
  'Addresses and ranges treated as the HMARK office. While this table is empty the off-network gate does nothing at all.';
comment on column public.office_networks.network is
  'cidr, so a single address is stored as /32 (IPv4) or /128 (IPv6) and matching is Postgres''s <<= rather than our own arithmetic.';

drop trigger if exists trg_office_networks_updated_at on public.office_networks;
create trigger trg_office_networks_updated_at
  before update on public.office_networks
  for each row execute function public.set_updated_at();

alter table public.office_networks enable row level security;

-- Readable by any active staff member: the Setup page shows it, and the
-- waiting screen needs to be able to say whether a gate exists at all.
drop policy if exists "office_networks_select" on public.office_networks;
create policy "office_networks_select" on public.office_networks
  for select using (public.is_active_staff());

-- Written only by a Super Admin. Adding an address here is handing out access
-- to every record in the system.
drop policy if exists "office_networks_write" on public.office_networks;
create policy "office_networks_write" on public.office_networks
  for all using (public.is_super_admin()) with check (public.is_super_admin());

-- ------------------------------------------------- asking, and being allowed
-- One row per request. The newest approved row that has not expired or been
-- revoked is what grants access, so a lapsed approval leaves its history
-- behind rather than disappearing.
create table if not exists public.staff_offsite_access (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid not null references public.staff (id) on delete cascade,
  /** Where they were when they asked, for whoever decides. */
  requested_ip text,
  requested_user_agent text,
  reason text,
  status text not null default 'pending' check (status in ('pending', 'approved', 'denied')),
  decided_by uuid references public.staff (id) on delete set null,
  decided_at timestamptz,
  /** Set on approval. Null while pending or denied. */
  expires_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.staff_offsite_access is
  'Requests to use the portal from outside the office network, and the decisions on them. Access is granted by the newest approved row that has not expired or been revoked.';

create index if not exists staff_offsite_access_staff_idx
  on public.staff_offsite_access (staff_id, status, expires_at desc);

-- One open request per person, so pressing the button twice does not queue
-- two identical decisions for management.
create unique index if not exists staff_offsite_access_one_pending
  on public.staff_offsite_access (staff_id)
  where status = 'pending';

drop trigger if exists trg_staff_offsite_access_updated_at on public.staff_offsite_access;
create trigger trg_staff_offsite_access_updated_at
  before update on public.staff_offsite_access
  for each row execute function public.set_updated_at();

alter table public.staff_offsite_access enable row level security;

-- A staff member may see their own; the people who decide may see all.
drop policy if exists "staff_offsite_access_select" on public.staff_offsite_access;
create policy "staff_offsite_access_select" on public.staff_offsite_access
  for select using (
    staff_id = auth.uid()
    or has_role(array['management', 'super_admin']::staff_role[])
  );

-- Asking for yourself. Only ever a pending row: a staff member cannot approve
-- their own request by writing the columns that grant it.
drop policy if exists "staff_offsite_access_request" on public.staff_offsite_access;
create policy "staff_offsite_access_request" on public.staff_offsite_access
  for insert with check (
    staff_id = auth.uid()
    and status = 'pending'
    and expires_at is null
    and decided_by is null
    and decided_at is null
    and revoked_at is null
  );

-- Deciding. Management and Super Admin only.
drop policy if exists "staff_offsite_access_decide" on public.staff_offsite_access;
create policy "staff_offsite_access_decide" on public.staff_offsite_access
  for update
  using (has_role(array['management', 'super_admin']::staff_role[]))
  with check (has_role(array['management', 'super_admin']::staff_role[]));

-- ------------------------------------------------------------ the decision
-- One round trip for the proxy, which runs on every request. Security definer
-- because it reads the staff table and the allow-list on behalf of somebody
-- who may not be allowed to read either yet.
create or replace function public.staff_access_state(p_ip text)
returns jsonb
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  v_staff record;
  v_gate_configured boolean;
  v_on_network boolean := false;
  v_approval record;
begin
  select id, role, status into v_staff from staff where id = auth.uid();

  -- Not a staff member at all: students and partners are not gated by this.
  if v_staff.id is null then
    return jsonb_build_object('is_staff', false, 'allowed', true);
  end if;

  select exists (select 1 from office_networks) into v_gate_configured;

  -- The gate does nothing until somebody says where the office is.
  if not v_gate_configured then
    return jsonb_build_object(
      'is_staff', true, 'allowed', true, 'gate_configured', false,
      'role', v_staff.role, 'on_office_network', false
    );
  end if;

  -- An address Postgres cannot parse is not on the network. Never an error:
  -- a proxy that cannot read an IP must not take the portal down.
  if p_ip is not null and p_ip <> '' then
    begin
      select exists (select 1 from office_networks where p_ip::inet <<= network) into v_on_network;
    exception when others then
      v_on_network := false;
    end;
  end if;

  if v_on_network then
    return jsonb_build_object(
      'is_staff', true, 'allowed', true, 'gate_configured', true,
      'role', v_staff.role, 'on_office_network', true
    );
  end if;

  -- A Super Admin is never gated, so the office can always be let back in.
  if v_staff.role = 'super_admin' then
    return jsonb_build_object(
      'is_staff', true, 'allowed', true, 'gate_configured', true, 'role', v_staff.role,
      'on_office_network', false, 'exempt', true
    );
  end if;

  select id, expires_at into v_approval
  from staff_offsite_access
  where staff_id = v_staff.id
    and status = 'approved'
    and revoked_at is null
    and expires_at > now()
  order by expires_at desc
  limit 1;

  return jsonb_build_object(
    'is_staff', true,
    'allowed', v_approval.id is not null,
    'gate_configured', true,
    'role', v_staff.role,
    'on_office_network', false,
    'approval_expires_at', v_approval.expires_at
  );
end;
$$;

comment on function public.staff_access_state is
  'What the proxy needs to decide whether this request may proceed, in one round trip. Returns allowed=true for students, partners, anyone on the office network, any Super Admin, and anyone holding an unexpired approval.';

grant execute on function public.staff_access_state(text) to authenticated;

-- ------------------------------------------------------------- permission
insert into public.permission_definitions (key, category, label, description, default_roles, sort_order)
values (
  'staff.approve_offsite_access',
  'Staff',
  'Approve use of the portal from outside the office',
  'Decide who may sign in from outside the office network, and for how long.',
  '{management,super_admin}',
  (select coalesce(max(sort_order), 0) + 10 from public.permission_definitions)
)
on conflict (key) do update
  set category = excluded.category,
      label = excluded.label,
      description = excluded.description;
