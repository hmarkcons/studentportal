-- A per-STUDENT intake (e.g. "Fall 2026"), set once at registration time —
-- distinct from applications.intake, which is per-application and can differ
-- across a student's multiple university applications. Free text, staff
-- types it manually at registration; powers the new "by intake" filter on
-- the Registered Students list alongside the existing "by month"/"by year"
-- filters (derived client-side from registered_at, no schema change needed
-- for those).
alter table leads add column if not exists intake text;
