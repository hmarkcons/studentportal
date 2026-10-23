-- Retry backoff for the publisher (0346). A target that fails a transient error
-- is retried on a later cron run, not the next one; next_attempt_at holds when
-- it is next eligible. Null means "try as soon as due".
alter table public.social_post_targets add column if not exists next_attempt_at timestamptz;
