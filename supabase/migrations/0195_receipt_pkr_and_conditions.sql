-- The receipt in two currencies, and installments that fall due on an event
-- rather than a date.

-- ------------------------------------------------------------- the rate
-- Editable, because the euro moves and a rate in the code means a redeploy
-- to correct a receipt.
alter table public.invoice_settings
  add column if not exists pkr_per_eur numeric(10, 2) not null default 335;

comment on column public.invoice_settings.pkr_per_eur is
  'Rupees per euro, shown beside every euro total on a receipt. Stamped onto each invoice when it is issued, so changing it here never moves a receipt already in a student''s hands.';

-- Stamped at issue. Without this, correcting the rate in Setup would silently
-- restate every receipt ever generated, including ones already paid against.
alter table public.invoices
  add column if not exists pkr_per_eur numeric(10, 2);

comment on column public.invoices.pkr_per_eur is
  'The rupee rate this invoice was calculated at. Null on invoices issued before the rate existed — those print in euro only rather than inventing a rate they were never quoted at.';

-- ------------------------------------------------- a due date that is an event
-- Two- and three-installment plans end on the admission coming through, not
-- on a date anybody can know when the agreement is signed. The wording is
-- stored rather than derived at print time so a receipt reissued next year
-- still says what the student agreed to.
alter table public.invoice_installments
  add column if not exists due_condition text;

comment on column public.invoice_installments.due_condition is
  'Printed in place of a due date when the installment falls due on an event — "On admission approval from your first public university". Null for an ordinary dated installment.';

-- One or the other, never neither: an installment with no date and no
-- condition is a payment nobody can be asked for.
alter table public.invoice_installments
  drop constraint if exists invoice_installments_due_known;
alter table public.invoice_installments
  add constraint invoice_installments_due_known
  check (due_date is not null or due_condition is not null);

-- Fully enforced, not NOT VALID: every installment already on file carries a
-- date, so there is nothing to grandfather in.
