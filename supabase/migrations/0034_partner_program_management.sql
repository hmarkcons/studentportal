-- HMARK CRM rebuild — step 30: Module 3D (Course/Program Management) — the
-- doc wants partner universities to self-manage their own course directory,
-- feeding into Module 1C. Partners already have read access to their own
-- `universities` row (0023) but had no access to `programs` at all — this
-- was a genuine gap (schema existed, RLS didn't cover partners).
-- Run after 0033_fix_finland_country_code.sql.

create policy "programs_select_partner" on programs for select
  using (university_id = partner_university_id());

create policy "programs_write_partner" on programs for all
  using (university_id = partner_university_id())
  with check (university_id = partner_university_id());
