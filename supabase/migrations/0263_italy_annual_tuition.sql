-- Italy's annual tuition, by level, as the office set it.
--
--   bachelors  EUR 1000/yr
--   masters    EUR 1500/yr
--   phd        EUR 0/yr
--
-- Annual, confirmed, and in the destination's own currency (EUR) — the same
-- basis as the five figures already on file, which were entered one at a time
-- and are the only real ones in the whole catalogue.
--
-- Italian public tuition is ISEE-banded, so a single number per programme is a
-- simplification whatever it says. These are the office's standing figures for
-- quoting a student, not a promise of what any individual will be assessed.
--
-- ------------------------------------------------- what this does NOT touch
--
-- Only programmes with no fee recorded. The five that already carry one keep
-- it, and two of those disagree with the rule on purpose:
--
--   Politecnico di Milano  bachelors  Computer Engineering  EUR 0
--   Università di Ferrara  masters    Small Business ...    EUR 1000
--
-- Both were entered deliberately and both are plausible — Politecnico's
-- no-tax-area band really is zero. A blanket rule overwriting the only
-- specific figures anybody has recorded would be the worst possible trade, so
-- the rule fills gaps and nothing else. Which also makes this idempotent: run
-- it again and it changes nothing.
--
-- ------------------------------------------------------ where the number goes
--
-- tuition_fee is read by suggestPartnerCommission(): a programme's negotiated
-- rate applied to its fee, as a SUGGESTED partner commission that Finance can
-- override. It does not reach a student's invoice — that is built from the
-- destination's consultancy_fee and admin_charge. No Italy programme carries a
-- commission rate today and no partner commission has ever been booked, so
-- nothing recalculates because of this; it starts mattering the first time a
-- rate is set on an Italian programme.

comment on column public.programs.tuition_fee is
  'Annual tuition for this programme, in the destination''s currency. Not a total for the degree, and not what the student is invoiced — invoices are built from the destination''s consultancy fee and admin charge. Read by suggestPartnerCommission() as the base a negotiated rate is applied to.';

do $$
declare
  italy uuid;
  filled int;
  total int;
begin
  select id into italy from public.destinations where display_name = 'Italy (Public)';
  if italy is null then
    raise exception '0263: no destination called "Italy (Public)"';
  end if;

  update public.programs p
     set tuition_fee = case p.level
           when 'bachelors' then 1000
           when 'masters' then 1500
           when 'phd' then 0
         end
    from public.universities u
   where u.id = p.university_id
     and u.destination_id = italy
     and p.tuition_fee is null
     and p.level in ('bachelors', 'masters', 'phd');
  get diagnostics filled = row_count;

  select count(*) into total
  from public.programs p
  join public.universities u on u.id = p.university_id
  where u.destination_id = italy and p.tuition_fee is not null;

  raise notice '0263: % programmes given the standing fee; % of Italy''s programmes now carry one', filled, total;
end $$;

-- Nothing may be left without a fee, and nothing may have been given one it
-- should not have. Checked rather than assumed: the update joins through
-- universities, and a join that quietly matched nothing is indistinguishable
-- from a successful run in the notice above.
do $$
declare
  missing int;
  wrong int;
begin
  select count(*) into missing
  from public.programs p
  join public.universities u on u.id = p.university_id
  join public.destinations d on d.id = u.destination_id
  where d.display_name = 'Italy (Public)' and p.tuition_fee is null;

  if missing > 0 then
    raise exception '0263: % Italy programmes still have no fee', missing;
  end if;

  -- Every fee is now either the rule's figure for its level, or one of the two
  -- deliberate exceptions above.
  select count(*) into wrong
  from public.programs p
  join public.universities u on u.id = p.university_id
  join public.destinations d on d.id = u.destination_id
  where d.display_name = 'Italy (Public)'
    and p.tuition_fee not in (0, 1000, 1500);

  if wrong > 0 then
    raise exception '0263: % Italy programmes carry a fee that is neither the rule nor a known exception', wrong;
  end if;
end $$;
