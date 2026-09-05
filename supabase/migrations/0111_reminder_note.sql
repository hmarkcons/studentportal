-- Lets a follow-up reminder (and any other reminder type) carry a short
-- free-text note, shown alongside the date on the Leads table and in the
-- Calendar event label — reminders previously had no text of their own.
alter table reminders add column note text;
