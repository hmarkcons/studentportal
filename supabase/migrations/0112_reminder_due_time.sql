-- Lets a reminder (currently just follow-ups) carry an optional time of day
-- alongside its date, shown on the calendar entry.
alter table reminders add column due_time time;
