-- Second half of 0249: drop the pay columns from staff.
--
-- This is the step that actually closes the leak. While the columns exist on
-- staff, policy "staff_select" still hands them to any of five roles along
-- with the row — RLS has no column dimension.
--
-- Apply only AFTER the app that reads staff_compensation is deployed.

-- Anything edited between 0249 and this migration was written to the old
-- columns by the still-deployed app, so re-sync before dropping rather than
-- trusting the earlier backfill to still be current.
update public.staff_compensation k set
  monthly_salary = s.monthly_salary,
  currency = s.currency,
  allowance = s.allowance,
  commission_rate_general = s.commission_rate_general,
  commission_rate_public_universities = s.commission_rate_public_universities,
  commission_type_general = s.commission_type_general,
  commission_type_public_universities = s.commission_type_public_universities,
  bonus_eligible = s.bonus_eligible,
  bonus_rate_percent = s.bonus_rate_percent
from public.staff s
where s.id = k.staff_id
  and (s.monthly_salary is distinct from k.monthly_salary
    or s.currency is distinct from k.currency
    or s.allowance is distinct from k.allowance
    or s.commission_rate_general is distinct from k.commission_rate_general
    or s.commission_rate_public_universities is distinct from k.commission_rate_public_universities
    or s.commission_type_general is distinct from k.commission_type_general
    or s.commission_type_public_universities is distinct from k.commission_type_public_universities
    or s.bonus_eligible is distinct from k.bonus_eligible
    or s.bonus_rate_percent is distinct from k.bonus_rate_percent);

-- Same guard as 0249. The drop is irreversible; it does not run unless every
-- staff member has a compensation row holding exactly their current values.
do $$
declare
  v_staff int;
  v_comp int;
  v_bad int;
begin
  select count(*) into v_staff from public.staff;
  select count(*) into v_comp from public.staff_compensation;
  if v_staff <> v_comp then
    raise exception 'staff_compensation has % rows for % staff', v_comp, v_staff;
  end if;

  select count(*) into v_bad
  from public.staff s
  join public.staff_compensation k on k.staff_id = s.id
  where s.monthly_salary is distinct from k.monthly_salary
     or s.currency is distinct from k.currency
     or s.allowance is distinct from k.allowance
     or s.commission_rate_general is distinct from k.commission_rate_general
     or s.commission_rate_public_universities is distinct from k.commission_rate_public_universities
     or s.commission_type_general is distinct from k.commission_type_general
     or s.commission_type_public_universities is distinct from k.commission_type_public_universities
     or s.bonus_eligible is distinct from k.bonus_eligible
     or s.bonus_rate_percent is distinct from k.bonus_rate_percent;
  if v_bad > 0 then
    raise exception '% staff rows do not match staff_compensation', v_bad;
  end if;
end $$;

alter table public.staff
  drop column if exists monthly_salary,
  drop column if exists currency,
  drop column if exists allowance,
  drop column if exists commission_rate_general,
  drop column if exists commission_rate_public_universities,
  drop column if exists commission_type_general,
  drop column if exists commission_type_public_universities,
  drop column if exists bonus_eligible,
  drop column if exists bonus_rate_percent;

notify pgrst, 'reload schema';
