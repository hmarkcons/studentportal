-- commission_rate_general/commission_rate_public_universities were
-- numeric(5,2) (max 999.99) — fine for a percentage, but 0096 lets either one
-- instead hold a flat currency amount (e.g. a PKR 5,000 or 150,000 flat
-- commission), which overflows that precision. Widened to numeric(12,2),
-- matching every other money column on this table (monthly_salary,
-- allowance, monthly_target).
alter table staff
  alter column commission_rate_general type numeric(12, 2),
  alter column commission_rate_public_universities type numeric(12, 2);
