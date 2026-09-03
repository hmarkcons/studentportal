-- Three staff-commission features:
-- 1. Commission TYPE (flat amount vs percentage), tracked separately for
--    private ("general") and public-university placements, so Super Admin
--    can mix e.g. a flat PKR amount for private-track and a percentage for
--    public-track on the same staff member.
-- 2. Monthly bonus: a staff member marked bonus_eligible with a
--    bonus_rate_percent (25/50/75/100) gets their whole month's earned
--    commission boosted by that percentage once they hit monthly_target —
--    applied app-side on the Payroll page, not here.
-- 3. Shared commission: a registration credited to the equal effort of two
--    staff members splits one commission amount 50/50 between them, instead
--    of crediting it entirely to one person.

alter table staff
  add column commission_type_general text not null default 'percentage' check (commission_type_general in ('flat', 'percentage')),
  add column commission_type_public_universities text not null default 'percentage' check (commission_type_public_universities in ('flat', 'percentage')),
  add column bonus_eligible boolean not null default false,
  add column bonus_rate_percent smallint check (bonus_rate_percent in (25, 50, 75, 100));

alter table staff_commissions
  add column shared_with_staff_id uuid references staff (id);

-- Replaces the 0090 version — adds the optional shared-staff split. Dropped
-- first rather than just re-created, since a same-named function taking a
-- different parameter count is a distinct overload in Postgres, not a
-- replacement, and would otherwise leave the old 6-arg signature callable
-- alongside this one.
drop function if exists create_staff_commission(uuid, uuid, numeric, text, date, uuid);

create or replace function create_staff_commission(
  p_staff_id uuid,
  p_student_id uuid,
  p_amount numeric,
  p_currency text,
  p_registration_date date,
  p_apply_credit_id uuid,
  p_shared_with_staff_id uuid default null
) returns uuid
language plpgsql security definer as $$
declare
  v_credit staff_commission_credits%rowtype;
  v_final_amount numeric := p_amount;
  v_commission_id uuid;
  v_half numeric;
  v_other_half numeric;
begin
  if not has_role(array['finance', 'super_admin']::staff_role[]) then
    raise exception 'Only Finance/Super Admin can add commission records.';
  end if;

  if p_shared_with_staff_id is not null and p_shared_with_staff_id = p_staff_id then
    raise exception 'Cannot share a commission with the same staff member.';
  end if;

  if p_apply_credit_id is not null then
    select * into v_credit from staff_commission_credits where id = p_apply_credit_id for update;
    if v_credit is null or v_credit.status <> 'available' or v_credit.staff_id <> p_staff_id then
      raise exception 'That credit is no longer available.';
    end if;
    if v_credit.currency <> p_currency then
      raise exception 'Credit is in %, but this commission is in % — match the currency to apply it.', v_credit.currency, p_currency;
    end if;
    v_final_amount := greatest(0, p_amount - v_credit.amount);
  end if;

  if p_shared_with_staff_id is not null then
    -- Equal-effort split — any odd cent goes to the primary staff's half so
    -- the two rows always sum exactly back to v_final_amount.
    v_other_half := trunc(v_final_amount / 2, 2);
    v_half := v_final_amount - v_other_half;

    insert into staff_commissions (staff_id, student_id, amount, currency, registration_date, shared_with_staff_id)
    values (p_staff_id, p_student_id, v_half, p_currency, p_registration_date, p_shared_with_staff_id)
    returning id into v_commission_id;

    insert into staff_commissions (staff_id, student_id, amount, currency, registration_date, shared_with_staff_id)
    values (p_shared_with_staff_id, p_student_id, v_other_half, p_currency, p_registration_date, p_staff_id);
  else
    insert into staff_commissions (staff_id, student_id, amount, currency, registration_date)
    values (p_staff_id, p_student_id, v_final_amount, p_currency, p_registration_date)
    returning id into v_commission_id;
  end if;

  if p_apply_credit_id is not null then
    update staff_commission_credits
    set status = 'applied', applied_to_commission_id = v_commission_id, applied_at = now()
    where id = p_apply_credit_id;
  end if;

  return v_commission_id;
end;
$$;

grant execute on function create_staff_commission(uuid, uuid, numeric, text, date, uuid, uuid) to authenticated;
