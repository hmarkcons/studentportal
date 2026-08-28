-- The live leads_insert policy was rejecting inserts from every staff role
-- even though is_active_staff() correctly returned true for the session
-- (confirmed via direct RPC/insert testing) — the live policy had drifted
-- from what 0007_leads.sql declares. Re-declare it explicitly rather than
-- rely on whatever's currently live, same pattern as 0065/0070.

drop policy if exists "leads_insert" on leads;
create policy "leads_insert" on leads for insert
  with check (is_active_staff());
