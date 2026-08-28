-- Refund business rules:
-- - 100% refund for "no admission" (university rejection), 50% for visa
--   refusal in a private-university-track country, both due within 90 days
--   of the refusal notice.
-- - Visa-refusal refunds for private-track destinations should surface
--   automatically instead of requiring manual entry (see
--   syncVisaRefusalRefunds in src/lib/actions/finance.ts).
-- - A student who had a visa refused but wants to reapply for a later
--   intake is not eligible for a refund -- tracked via eligibility_status
--   plus the intake note/country they're targeting.

alter table refund_requests
  add column if not exists trigger_type text not null default 'manual'
    check (trigger_type in ('manual', 'no_admission', 'visa_refusal')),
  add column if not exists refund_percent numeric(5, 2),
  add column if not exists refusal_notice_date date,
  add column if not exists eligibility_status text not null default 'eligible'
    check (eligibility_status in ('eligible', 'ineligible_reapplying')),
  add column if not exists next_intake_note text,
  add column if not exists next_intake_country_id uuid references destinations (id);
