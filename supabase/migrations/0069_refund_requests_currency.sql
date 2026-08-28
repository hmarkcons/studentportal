-- Auto-calculated refund amounts are derived from the student's consultancy
-- fee, which is currency-denominated (EUR/PKR/etc.) -- track it alongside
-- amount so the Refunds page can display it correctly instead of a bare number.
alter table refund_requests add column if not exists currency text;
