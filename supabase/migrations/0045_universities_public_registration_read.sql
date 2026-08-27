-- The public, unauthenticated /register/partner page needs to list active
-- universities so a prospective partner can pick theirs before any account
-- exists. Every existing universities_select_* policy (0008 staff-only,
-- 0023 partner-own-university-only, 0026 registered-students-only)
-- requires an authenticated session, so anonymous visitors got zero rows
-- and the dropdown was silently empty. Grant anon read on active
-- universities' basic directory fields (name/city/region — no financial data
-- lives on this table, unlike destinations).
create policy "universities_select_public" on universities for select
  to anon
  using (status = 'active');
