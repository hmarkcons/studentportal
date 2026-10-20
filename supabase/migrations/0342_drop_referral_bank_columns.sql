-- Contract step of M2 (0341): drop the bank details + CNIC from
-- referral_parties now that the app reads and writes them in
-- referral_party_bank (finance / Super Admin only).
--
-- APPLY ONLY AFTER the code that uses referral_party_bank is deployed — the
-- previous deploy writes these columns, so dropping them first would break
-- adding or editing a referring party. 0341 already copied any values across.
-- The table is empty today, so there is nothing to lose even so.

alter table public.referral_parties
  drop column if exists cnic,
  drop column if exists bank_name,
  drop column if exists account_title,
  drop column if exists account_number;
