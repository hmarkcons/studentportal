-- Second half of 0249: drop the pay columns from staff.
--
-- This is the step that actually closes the leak. While the columns exist on
-- staff, policy "staff_select" still hands them to any of five roles along
-- with the row — RLS has no column dimension.
--
-- Apply only AFTER the app that reads staff_compensation is deployed.

-- This migration deliberately does NOT re-copy from the old columns before
-- dropping them. By the time it runs the deployed app writes
-- staff_compensation and no longer touches staff's pay columns, so those
-- columns are the stale copy — copying from them would silently revert any pay
-- set since 0249.
--
-- So the two are required to agree instead, and the migration stops if they
-- don't. Disagreement means pay was changed in the window between 0249 and the
-- deploy: staff_compensation is authoritative from the deploy onwards, and
-- reconciling the difference is a judgement call for whoever is applying this,
-- not something to paper over here. (Checked before applying: 0 of 6 rows
-- differed.)
--
-- The drop is irreversible; it does not run unless every staff member has a
-- compensation row holding exactly their current values.
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
    raise exception '% staff rows do not match staff_compensation — reconcile before dropping (staff_compensation is the authority once the app is deployed)', v_bad;
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
