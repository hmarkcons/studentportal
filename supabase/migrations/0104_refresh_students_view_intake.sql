-- Same gotcha as 0044: `students` is `select * from leads where registered_at
-- is not null`, and Postgres freezes `select *` into an explicit column list
-- at CREATE time — so leads.intake (0102) never appeared in the view until
-- it's recreated.
create or replace view students as select * from leads where registered_at is not null;
