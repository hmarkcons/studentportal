-- Payroll records are private to the person they pay, and to Finance and
-- Super Admin, who run payroll.
--
-- 0054 let any active staff member read every staff_payroll row —
-- is_active_staff() — so a counsellor could read a colleague's basic salary,
-- allowances, commission, deductions and tax straight from the API. Found on
-- 2026-09-24 and confirmed with a fresh counsellor account, which read another
-- person's row, salary included. The only page that reads the table is
-- Finance → Payroll, which is Finance's (page.finance.payroll) and Super
-- Admin's; writing was already theirs alone.
--
-- Pay itself moved to staff_compensation in 0249, which has its own policy;
-- this closes the monthly records built from it.

do $$
begin
  if to_regclass('public.staff_payroll') is null then
    raise exception '0277: public.staff_payroll is missing (0054)';
  end if;
end $$;

drop policy if exists "staff_payroll_select" on staff_payroll;
create policy "staff_payroll_select" on staff_payroll for select
  using (staff_id = auth.uid() or has_role(array['finance', 'super_admin']::staff_role[]));
