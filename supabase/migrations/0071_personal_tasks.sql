-- Personal calendar tasks/reminders: staff workflow items not tied to any
-- student or application (e.g. "call the printer", "team meeting at 2pm"),
-- shown on the new weekly/monthly calendar grid alongside the existing
-- student/application-linked tasks, reminders, deadlines, and visa
-- appointments. Private to the owner, visible to management/super_admin for
-- oversight (same visibility tier used elsewhere in this schema).
create table personal_tasks (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references staff (id) on delete cascade,
  title text not null,
  description text,
  due_date date not null,
  due_time time,
  priority text not null default 'medium' check (priority in ('urgent', 'medium', 'low')),
  status text not null default 'pending' check (status in ('pending', 'done')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists trg_personal_tasks_updated_at on personal_tasks;
create trigger trg_personal_tasks_updated_at
  before update on personal_tasks
  for each row execute function set_updated_at();

alter table personal_tasks enable row level security;

create policy "personal_tasks_select" on personal_tasks for select
  using (owner_id = auth.uid() or has_role(array['management', 'super_admin']::staff_role[]));
create policy "personal_tasks_write" on personal_tasks for all
  using (owner_id = auth.uid() or has_role(array['management', 'super_admin']::staff_role[]))
  with check (owner_id = auth.uid() or has_role(array['management', 'super_admin']::staff_role[]));

create index personal_tasks_owner_date_idx on personal_tasks (owner_id, due_date);
