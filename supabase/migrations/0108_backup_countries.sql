-- Backup country support: a lead's destinations are now split into exactly
-- one "primary" pick and up to 3 "backup" picks (enforced app-side, not by a
-- DB constraint, matching this codebase's existing convention for similar
-- caps like agreements.installment_count). is_backup on lead_destinations
-- drives both the "Backup Country" column on the registered-students table
-- and which destinations get an admin-fee-only agreement. is_backup on
-- agreements is a separate, point-in-time snapshot taken when the agreement
-- is generated/edited (see generateAgreement/updateAgreement) so a later
-- change to a lead's destinations never silently reshapes an existing
-- agreement's fee table.
alter table lead_destinations add column is_backup boolean not null default false;
alter table agreements add column is_backup boolean not null default false;
