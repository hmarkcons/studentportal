-- Calendar enrichment: all-day support, multi-day spans, notes, guest
-- emails, a user-selectable color override, and simple recurrence for both
-- application-linked tasks and personal reminders.
--
-- application_tasks.description is left exactly as-is (it's the task's
-- short label/title, read by TaskList.tsx and DashboardTaskList.tsx
-- elsewhere in the app) -- `notes` is a new, separate, optional field so
-- nothing outside the calendar needs to change.
alter table application_tasks
  add column if not exists notes text,
  add column if not exists all_day boolean not null default true,
  add column if not exists due_time time,
  add column if not exists end_date date,
  add column if not exists color text,
  add column if not exists guest_emails text[] not null default '{}',
  add column if not exists recurrence text not null default 'none'
    check (recurrence in ('none', 'daily', 'weekly', 'monthly')),
  add column if not exists recurrence_end_date date;

-- personal_tasks already has title + description (description already means
-- "additional notes", distinct from title) and due_time from migration 0071.
alter table personal_tasks
  add column if not exists all_day boolean not null default false,
  add column if not exists end_date date,
  add column if not exists color text,
  add column if not exists guest_emails text[] not null default '{}',
  add column if not exists recurrence text not null default 'none'
    check (recurrence in ('none', 'daily', 'weekly', 'monthly')),
  add column if not exists recurrence_end_date date;
