-- CRM overhaul step 2: scholarship status vocabulary, agreement discount,
-- inventory module, and tighter agreement write permissions
-- (super_admin: generate/view/modify/delete; processing: generate/view/modify;
-- everyone else: view only).

-- ---------------------------------------------------------------------------
-- Scholarship status: Submitted/Pending/Rejected/Accepted/Modification
-- ---------------------------------------------------------------------------

update student_scholarships set status = 'submitted' where status = 'applied';
update student_scholarships set status = 'accepted' where status = 'awarded';

alter table student_scholarships drop constraint if exists student_scholarships_status_check;
alter table student_scholarships alter column status set default 'submitted';
alter table student_scholarships add constraint student_scholarships_status_check
  check (status in ('submitted', 'pending', 'rejected', 'accepted', 'modification'));

-- ---------------------------------------------------------------------------
-- Agreement discount
-- ---------------------------------------------------------------------------

alter table agreements add column discount_amount numeric(10, 2);

-- ---------------------------------------------------------------------------
-- Inventory management
-- ---------------------------------------------------------------------------

create table inventory_items (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  category text,
  unit text,
  quantity_on_hand numeric(12, 2) not null default 0,
  low_stock_threshold numeric(12, 2),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists trg_inventory_items_updated_at on inventory_items;
create trigger trg_inventory_items_updated_at
  before update on inventory_items
  for each row execute function set_updated_at();

create table inventory_requests (
  id uuid primary key default gen_random_uuid(),
  item_id uuid references inventory_items (id) on delete set null,
  requested_by uuid references staff (id),
  quantity numeric(12, 2) not null,
  status text not null default 'pending' check (status in ('pending', 'fulfilled', 'rejected')),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists trg_inventory_requests_updated_at on inventory_requests;
create trigger trg_inventory_requests_updated_at
  before update on inventory_requests
  for each row execute function set_updated_at();

alter table inventory_items enable row level security;
alter table inventory_requests enable row level security;

create policy "inventory_items_select" on inventory_items for select using (is_active_staff());
create policy "inventory_items_write" on inventory_items for all
  using (has_role(array['management', 'super_admin']::staff_role[]))
  with check (has_role(array['management', 'super_admin']::staff_role[]));

create policy "inventory_requests_select" on inventory_requests for select
  using (requested_by = auth.uid() or has_role(array['management', 'super_admin']::staff_role[]));
create policy "inventory_requests_insert" on inventory_requests for insert
  with check (is_active_staff());
create policy "inventory_requests_update" on inventory_requests for update
  using (has_role(array['management', 'super_admin']::staff_role[]))
  with check (has_role(array['management', 'super_admin']::staff_role[]));
create policy "inventory_requests_delete" on inventory_requests for delete
  using (has_role(array['management', 'super_admin']::staff_role[]));

-- ---------------------------------------------------------------------------
-- Agreements: split "any active staff" write into insert/select (broad) vs
-- update (processing + super_admin) vs delete (super_admin only).
-- ---------------------------------------------------------------------------

drop policy if exists "agreements_write" on agreements;

create policy "agreements_insert" on agreements for insert
  with check (is_active_staff());
create policy "agreements_update" on agreements for update
  using (has_role(array['processing', 'super_admin']::staff_role[]))
  with check (has_role(array['processing', 'super_admin']::staff_role[]));
create policy "agreements_delete" on agreements for delete
  using (has_role(array['super_admin']::staff_role[]));
