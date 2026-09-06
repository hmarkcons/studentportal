-- Per-student processing officer. Processing work was previously owned by
-- the whole Processing Team with no named person per student, which left
-- nobody specific to notify about an upcoming application deadline.
--
-- Optional on purpose: a student with no officer assigned still falls back
-- to the whole team for deadline visibility and emails, so nothing goes
-- unwatched while assignments are being filled in.
alter table leads add column processing_officer_id uuid references staff (id) on delete set null;

create index if not exists leads_processing_officer_id_idx on leads (processing_officer_id);
