-- `students` is `select * from leads where registered_at is not null` (0009).
-- Postgres expands `select *` into an explicit column list at CREATE time,
-- so columns added to `leads` afterward (registration_status, discount_amount,
-- discount_reason, and any future ones) never appear in the view until it's
-- recreated.
create or replace view students as select * from leads where registered_at is not null;
