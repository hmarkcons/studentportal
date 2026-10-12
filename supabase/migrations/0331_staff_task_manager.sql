-- The staff task manager: to-do lists, tasks assigned to colleagues, each with
-- a checklist, comments and files, on the board, the list, the dashboard and
-- the calendar.
--
-- A task is still a personal_tasks row — each person's own copy, which is what
-- their calendar, their reminders and their pop-ups already read (0071, 0295,
-- 0324). What is new is the row above the copies:
--
--   staff_tasks                one per assignment: who set it, and what its
--                              copies share — the checklist's steps, the
--                              comments, the files. Every personal task has
--                              one, made for it on insert if none is given,
--                              so a calendar item can take a checklist too.
--   personal_tasks.assigned_by who gave this copy to its owner (null, or the
--                              owner, for their own).
--   personal_tasks.status      gains 'in_progress', between To do and Done;
--                              started_at and completed_at are stamped by
--                              the database as it moves.
--   staff_task_checklist       a task's steps, shared by its copies;
--   staff_task_checklist_done  ticked by each person on their own copy.
--   staff_task_comments        one thread per task, for everyone on it.
--   staff_task_files           files attached to the task, kept in the
--                              documents bucket under tasks/<task>/.
--
-- Who sees what. Anyone may assign a task to anyone. A copy is seen by its
-- owner, by whoever assigned it, by the others on the same task, and by
-- Management and Super Admin. Its owner moves it along and may reschedule
-- it; only whoever assigned it (or Management / Super Admin) deletes it or
-- passes it to someone else. Everything new is audited (0322) and the
-- assignee, the assigner and the others on the task are alerted (0320).

begin;

-- 1 ---------------------------------------------------------- the task above the copies
create table if not exists public.staff_tasks (
  id uuid primary key default gen_random_uuid(),
  created_by uuid references public.staff (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now()
);
alter table public.staff_tasks enable row level security;

alter table public.personal_tasks
  add column if not exists task_id uuid references public.staff_tasks (id) on delete cascade,
  add column if not exists assigned_by uuid references public.staff (id) on delete set null,
  add column if not exists started_at timestamptz,
  add column if not exists completed_at timestamptz;

alter table public.personal_tasks drop constraint if exists personal_tasks_status_check;
alter table public.personal_tasks
  add constraint personal_tasks_status_check check (status in ('pending', 'in_progress', 'done'));

create index if not exists personal_tasks_task_idx on public.personal_tasks (task_id);
create index if not exists personal_tasks_assigned_by_idx on public.personal_tasks (assigned_by, status);
create index if not exists personal_tasks_student_idx on public.personal_tasks (student_id) where student_id is not null;

-- Every copy belongs to a task: one is made for it when none is given — a
-- calendar item, a ghost-chase follow-up (0186), anything written before this.
create or replace function public.personal_task_parent() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
begin
  if new.task_id is null then
    insert into staff_tasks (created_by) values (coalesce(new.assigned_by, new.owner_id)) returning id into new.task_id;
  elsif v_uid is not null
        and not has_role(array['management', 'super_admin']::staff_role[])
        and not exists (select 1 from staff_tasks t where t.id = new.task_id and t.created_by = v_uid) then
    -- Checked here rather than in the insert policy: a policy's subquery
    -- cannot be relied on to see the task this same trigger made a moment ago.
    raise exception 'A copy can only be added to a task you set.';
  end if;
  if new.status = 'done' then
    new.completed_at := coalesce(new.completed_at, now());
  elsif new.status = 'in_progress' then
    new.started_at := coalesce(new.started_at, now());
  end if;
  return new;
end;
$$;
drop trigger if exists trg_personal_tasks_parent on public.personal_tasks;
create trigger trg_personal_tasks_parent
  before insert on public.personal_tasks
  for each row execute function public.personal_task_parent();

-- The ones already there, without their updated_at, audit or anything else
-- firing for what is bookkeeping.
alter table public.personal_tasks disable trigger user;
do $$
declare
  r record;
  v uuid;
begin
  for r in select id, owner_id, status, updated_at from public.personal_tasks where task_id is null loop
    insert into public.staff_tasks (created_by) values (r.owner_id) returning id into v;
    update public.personal_tasks
       set task_id = v,
           completed_at = case when r.status = 'done' then r.updated_at end
     where id = r.id;
  end loop;
end;
$$;
alter table public.personal_tasks enable trigger user;
alter table public.personal_tasks alter column task_id set not null;

-- When a copy starts and when it is finished, from the status alone; and
-- who may change who a copy belongs to.
create or replace function public.personal_task_guard() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_manager boolean := has_role(array['management', 'super_admin']::staff_role[]);
begin
  if new.status is distinct from old.status then
    if new.status = 'in_progress' then
      new.started_at := coalesce(old.started_at, now());
      new.completed_at := null;
    elsif new.status = 'done' then
      new.completed_at := now();
    else
      new.completed_at := null;
    end if;
  end if;
  -- A copy moves to another task, or is given away, only by whoever set it
  -- or by Management / Super Admin. A signed-out caller (the service role,
  -- a migration) is not stopped.
  if v_uid is not null and not v_manager then
    if new.task_id is distinct from old.task_id then
      raise exception 'A task cannot be moved to another task.';
    end if;
    if new.assigned_by is distinct from old.assigned_by
       and v_uid is distinct from coalesce(old.assigned_by, old.owner_id) then
      raise exception 'Only whoever assigned this task can change who assigned it.';
    end if;
    if new.owner_id is distinct from old.owner_id
       and v_uid is distinct from coalesce(old.assigned_by, old.owner_id) then
      raise exception 'Only whoever assigned this task can give it to someone else.';
    end if;
  end if;
  return new;
end;
$$;
drop trigger if exists trg_personal_tasks_guard on public.personal_tasks;
create trigger trg_personal_tasks_guard
  before update on public.personal_tasks
  for each row execute function public.personal_task_guard();

-- 2 ---------------------------------------------------------- who is on a task
-- Whoever set it, or owns or assigned one of its copies. Security definer, so
-- a policy on a copy can ask about its siblings without recursing into the
-- copies' own policy.
create or replace function public.staff_task_member(p_task uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from staff_tasks t where t.id = p_task and t.created_by = auth.uid())
      or exists (
        select 1 from personal_tasks p
        where p.task_id = p_task and (p.owner_id = auth.uid() or p.assigned_by = auth.uid())
      );
$$;
revoke execute on function public.staff_task_member(uuid) from public, anon;
grant execute on function public.staff_task_member(uuid) to authenticated;

-- Who may tick a step on a copy: its owner, whoever assigned it, or Management / Super Admin.
create or replace function public.staff_task_copy_writer(p_copy uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from personal_tasks p
    where p.id = p_copy and (p.owner_id = auth.uid() or p.assigned_by = auth.uid())
  ) or has_role(array['management', 'super_admin']::staff_role[]);
$$;
revoke execute on function public.staff_task_copy_writer(uuid) from public, anon;
grant execute on function public.staff_task_copy_writer(uuid) to authenticated;

-- 3 ---------------------------------------------------------- the copies' policies
drop policy if exists "personal_tasks_select" on public.personal_tasks;
drop policy if exists "personal_tasks_write" on public.personal_tasks;
drop policy if exists "personal_tasks_insert" on public.personal_tasks;
drop policy if exists "personal_tasks_update" on public.personal_tasks;
drop policy if exists "personal_tasks_delete" on public.personal_tasks;

create policy "personal_tasks_select" on public.personal_tasks for select
  using (
    owner_id = (select auth.uid())
    or assigned_by = (select auth.uid())
    or (select has_role(array['management', 'super_admin']::staff_role[]))
    or staff_task_member(task_id)
  );

-- One's own, or one given to a colleague. That it goes under a task one set
-- oneself is checked by personal_task_parent.
create policy "personal_tasks_insert" on public.personal_tasks for insert
  with check (
    (owner_id = (select auth.uid()) and (assigned_by is null or assigned_by = (select auth.uid())))
    or assigned_by = (select auth.uid())
    or (select has_role(array['management', 'super_admin']::staff_role[]))
  );

create policy "personal_tasks_update" on public.personal_tasks for update
  using (
    owner_id = (select auth.uid())
    or assigned_by = (select auth.uid())
    or (select has_role(array['management', 'super_admin']::staff_role[]))
  )
  with check (
    owner_id = (select auth.uid())
    or assigned_by = (select auth.uid())
    or (select has_role(array['management', 'super_admin']::staff_role[]))
  );

-- A task given to you is not yours to delete — mark it done instead.
create policy "personal_tasks_delete" on public.personal_tasks for delete
  using (
    (owner_id = (select auth.uid()) and (assigned_by is null or assigned_by = (select auth.uid())))
    or assigned_by = (select auth.uid())
    or (select has_role(array['management', 'super_admin']::staff_role[]))
  );

create policy "staff_tasks_select" on public.staff_tasks for select
  using (
    created_by = (select auth.uid())
    or (select has_role(array['management', 'super_admin']::staff_role[]))
    or staff_task_member(id)
  );
create policy "staff_tasks_insert" on public.staff_tasks for insert
  with check (created_by = (select auth.uid()));
create policy "staff_tasks_delete" on public.staff_tasks for delete
  using (created_by = (select auth.uid()) or (select has_role(array['management', 'super_admin']::staff_role[])));

-- 4 ---------------------------------------------------------- checklist, comments, files
create table if not exists public.staff_task_checklist (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.staff_tasks (id) on delete cascade,
  label text not null check (char_length(btrim(label)) between 1 and 300),
  sort_order integer not null default 0,
  created_by uuid references public.staff (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now()
);
create index if not exists staff_task_checklist_task_idx on public.staff_task_checklist (task_id, sort_order);
alter table public.staff_task_checklist enable row level security;
create policy "staff_task_checklist_select" on public.staff_task_checklist for select
  using ((select has_role(array['management', 'super_admin']::staff_role[])) or staff_task_member(task_id));
create policy "staff_task_checklist_write" on public.staff_task_checklist for all
  using ((select has_role(array['management', 'super_admin']::staff_role[])) or staff_task_member(task_id))
  with check ((select has_role(array['management', 'super_admin']::staff_role[])) or staff_task_member(task_id));

create table if not exists public.staff_task_checklist_done (
  item_id uuid not null references public.staff_task_checklist (id) on delete cascade,
  copy_id uuid not null references public.personal_tasks (id) on delete cascade,
  done_by uuid references public.staff (id) on delete set null default auth.uid(),
  done_at timestamptz not null default now(),
  primary key (item_id, copy_id)
);
create index if not exists staff_task_checklist_done_copy_idx on public.staff_task_checklist_done (copy_id);
alter table public.staff_task_checklist_done enable row level security;
create policy "staff_task_checklist_done_select" on public.staff_task_checklist_done for select
  using (exists (select 1 from public.personal_tasks p where p.id = copy_id));
create policy "staff_task_checklist_done_write" on public.staff_task_checklist_done for all
  using (staff_task_copy_writer(copy_id))
  with check (staff_task_copy_writer(copy_id));

create table if not exists public.staff_task_comments (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.staff_tasks (id) on delete cascade,
  author_id uuid references public.staff (id) on delete set null default auth.uid(),
  body text not null check (char_length(btrim(body)) between 1 and 2000),
  created_at timestamptz not null default now()
);
create index if not exists staff_task_comments_task_idx on public.staff_task_comments (task_id, created_at);
alter table public.staff_task_comments enable row level security;
create policy "staff_task_comments_select" on public.staff_task_comments for select
  using ((select has_role(array['management', 'super_admin']::staff_role[])) or staff_task_member(task_id));
create policy "staff_task_comments_insert" on public.staff_task_comments for insert
  with check (
    author_id = (select auth.uid())
    and ((select has_role(array['management', 'super_admin']::staff_role[])) or staff_task_member(task_id))
  );
create policy "staff_task_comments_delete" on public.staff_task_comments for delete
  using (author_id = (select auth.uid()) or (select has_role(array['management', 'super_admin']::staff_role[])));

create table if not exists public.staff_task_files (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.staff_tasks (id) on delete cascade,
  file_path text not null,
  file_name text not null check (char_length(file_name) between 1 and 300),
  size_bytes bigint,
  uploaded_by uuid references public.staff (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now()
);
create index if not exists staff_task_files_task_idx on public.staff_task_files (task_id, created_at);
alter table public.staff_task_files enable row level security;
create policy "staff_task_files_select" on public.staff_task_files for select
  using ((select has_role(array['management', 'super_admin']::staff_role[])) or staff_task_member(task_id));
create policy "staff_task_files_insert" on public.staff_task_files for insert
  with check (
    uploaded_by = (select auth.uid())
    and ((select has_role(array['management', 'super_admin']::staff_role[])) or staff_task_member(task_id))
  );
create policy "staff_task_files_delete" on public.staff_task_files for delete
  using (
    uploaded_by = (select auth.uid())
    or exists (select 1 from public.staff_tasks t where t.id = task_id and t.created_by = (select auth.uid()))
    or (select has_role(array['management', 'super_admin']::staff_role[]))
  );

-- 5 ---------------------------------------------------------- audited (0322)
drop trigger if exists trg_audit_staff_tasks on public.staff_tasks;
create trigger trg_audit_staff_tasks after insert or update or delete on public.staff_tasks
  for each row execute function public.log_audit_event('id');
drop trigger if exists trg_audit_staff_task_checklist on public.staff_task_checklist;
create trigger trg_audit_staff_task_checklist after insert or update or delete on public.staff_task_checklist
  for each row execute function public.log_audit_event('id');
drop trigger if exists trg_audit_staff_task_checklist_done on public.staff_task_checklist_done;
create trigger trg_audit_staff_task_checklist_done after insert or update or delete on public.staff_task_checklist_done
  for each row execute function public.log_audit_event('item_id', 'copy_id');
drop trigger if exists trg_audit_staff_task_comments on public.staff_task_comments;
create trigger trg_audit_staff_task_comments after insert or update or delete on public.staff_task_comments
  for each row execute function public.log_audit_event('id');
drop trigger if exists trg_audit_staff_task_files on public.staff_task_files;
create trigger trg_audit_staff_task_files after insert or update or delete on public.staff_task_files
  for each row execute function public.log_audit_event('id');

-- 6 ---------------------------------------------------------- open, not just pending
-- Two indexes written when a personal task was pending or done (0187, 0295).
-- An in-progress follow-up is still the open one, and the only one there may be.
drop index if exists public.personal_tasks_one_open_follow_up;
create unique index if not exists personal_tasks_one_open_follow_up
  on public.personal_tasks (student_id, source)
  where source is not null and status <> 'done';

drop index if exists public.personal_tasks_owner_notify_idx;
create index if not exists personal_tasks_owner_notify_idx
  on public.personal_tasks (owner_id, due_date) where notify_minutes is not null and status <> 'done';

-- 7 ---------------------------------------------------------- the people one can assign to
-- Every member of staff may assign to every other, but not every member may
-- read the staff table (0105: marketing sees only itself). Names and
-- designations only — nothing withheld by 0285.
create or replace function public.task_people()
returns table (id uuid, full_name text, designation text, active boolean)
language sql stable security definer set search_path = public as $$
  select s.id, s.full_name, s.designation, s.status = 'active'
  from staff s
  where is_active_staff()
  order by s.full_name;
$$;
revoke execute on function public.task_people() from public, anon;
grant execute on function public.task_people() to authenticated;

-- 8 ---------------------------------------------------------- the files' folder
-- documents/tasks/<task id>/… — read, added and removed by whoever is on the
-- task, and by Management / Super Admin. The generic staff policy (0047)
-- needs a student id first, which this folder does not have.
create or replace function public.staff_task_folder_member(p_name text) returns boolean
language sql stable security definer set search_path = public as $$
  select (storage.foldername(p_name))[1] = 'tasks'
     and (
       has_role(array['management', 'super_admin']::staff_role[])
       or staff_task_member(safe_uuid((storage.foldername(p_name))[2]))
     );
$$;
revoke execute on function public.staff_task_folder_member(text) from public, anon;
grant execute on function public.staff_task_folder_member(text) to authenticated;

drop policy if exists "documents_storage_tasks_select" on storage.objects;
create policy "documents_storage_tasks_select" on storage.objects for select
  using (bucket_id = 'documents' and public.staff_task_folder_member(name));
drop policy if exists "documents_storage_tasks_insert" on storage.objects;
create policy "documents_storage_tasks_insert" on storage.objects for insert
  with check (bucket_id = 'documents' and public.staff_task_folder_member(name));
drop policy if exists "documents_storage_tasks_delete" on storage.objects;
create policy "documents_storage_tasks_delete" on storage.objects for delete
  using (bucket_id = 'documents' and public.staff_task_folder_member(name));

-- 9 ---------------------------------------------------------- who is told (0320)
-- Given a task: its new owner. Finished: whoever set it, once per task
-- however many of its people finish. Everything put in an alert is
-- coalesced — a trigger that fails fails the write it rides on.
create or replace function public.notifications_on_staff_task() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_name text;
begin
  if new.assigned_by is null or new.assigned_by = new.owner_id then
    return null;
  end if;
  if (tg_op = 'INSERT' or new.owner_id is distinct from old.owner_id) and new.status <> 'done' then
    select full_name into v_name from staff where id = new.assigned_by;
    perform notify(new.owner_id, 'task_assigned', null,
      'Task for you: ' || coalesce(nullif(btrim(new.title), ''), 'a task'), null,
      concat_ws(' · ', 'from ' || coalesce(v_name, 'a colleague'),
        'due ' || to_char(new.due_date, 'FMDD Mon YYYY') || coalesce(' ' || to_char(new.due_time, 'HH24:MI'), '')),
      '/tasks?task=' || new.id, null, new.student_id, true, true);
  end if;
  if tg_op = 'UPDATE' and new.status = 'done' and old.status is distinct from 'done' then
    select full_name into v_name from staff where id = new.owner_id;
    perform notify(new.assigned_by, 'task_done', 'task_done:' || new.task_id,
      coalesce(v_name, 'A colleague') || ' finished: ' || coalesce(nullif(btrim(new.title), ''), 'a task'),
      '{n} people finished: ' || coalesce(nullif(btrim(new.title), ''), 'a task'),
      null, '/tasks?task=' || new.id, '/tasks?task=' || new.id, new.student_id, true, true);
  end if;
  return null;
end;
$$;
drop trigger if exists trg_notifications_on_staff_task on public.personal_tasks;
create trigger trg_notifications_on_staff_task
  after insert or update of owner_id, status on public.personal_tasks
  for each row execute function public.notifications_on_staff_task();

-- A comment: everyone else on the task — its owners, whoever assigned them,
-- whoever set it — each linked to their own copy where they have one.
create or replace function public.notifications_on_staff_task_comment() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_author text;
  v_title text;
  r record;
begin
  select full_name into v_author from staff where id = new.author_id;
  select title into v_title from personal_tasks where task_id = new.task_id order by created_at, id limit 1;
  for r in
    select distinct on (m.person) m.person, m.copy_id
    from (
      select p.owner_id as person, p.id as copy_id, 0 as pref from personal_tasks p where p.task_id = new.task_id
      union all
      select p.assigned_by, p.id, 1 from personal_tasks p where p.task_id = new.task_id and p.assigned_by is not null
      union all
      select t.created_by, (select p.id from personal_tasks p where p.task_id = t.id order by p.created_at, p.id limit 1), 2
      from staff_tasks t where t.id = new.task_id
    ) m
    where m.person is not null and m.person is distinct from new.author_id
    order by m.person, m.pref
  loop
    perform notify(r.person, 'task_comment', 'task_comment:' || new.task_id,
      coalesce(v_author, 'A colleague') || ' commented on: ' || coalesce(nullif(btrim(v_title), ''), 'a task'),
      '{n} new comments on: ' || coalesce(nullif(btrim(v_title), ''), 'a task'),
      left(coalesce(new.body, ''), 200),
      coalesce('/tasks?task=' || r.copy_id, '/tasks'), coalesce('/tasks?task=' || r.copy_id, '/tasks'), null, true, true);
  end loop;
  return null;
end;
$$;
drop trigger if exists trg_notifications_on_staff_task_comment on public.staff_task_comments;
create trigger trg_notifications_on_staff_task_comment
  after insert on public.staff_task_comments
  for each row execute function public.notifications_on_staff_task_comment();

-- 10 --------------------------------------------------------- the page
insert into public.permission_definitions (key, category, label, description, default_roles, sort_order) values
  ('page.tasks', 'Menu & page access', 'Open Tasks', 'See Tasks in the menu and open it.', array['management', 'counselor', 'processing', 'finance', 'marketing', 'digital_marketing']::staff_role[], 107)
on conflict (key) do nothing;

commit;
