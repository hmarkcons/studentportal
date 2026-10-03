-- The city a lead is from: a column on the leads list, in the lead forms, and
-- in the leads Excel template, export and import.
--
-- On leads itself, which the student can read and, outside the blocklist of
-- restrict_student_lead_self_update (0084), edit — as with their address,
-- it is their own detail, not an internal note.

alter table public.leads add column if not exists city text;

alter table public.leads drop constraint if exists leads_city_length;
alter table public.leads add constraint leads_city_length check (city is null or char_length(city) <= 120);
