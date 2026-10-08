-- The login page beside an interview's login, as every other saved login now
-- has (src/lib/portalLink.ts): the university's own interview platform, a
-- testing site. Its joining link (application_interviews.interview_link) is
-- where the interview happens; this is where the login is used, which is not
-- always the same page.
--
-- Read and written under the table's own policies (0151), so the student sees
-- it only when the login is shared with them, as the rest of it.

alter table public.application_interview_credentials add column if not exists login_link text;

alter table public.application_interview_credentials drop constraint if exists application_interview_credentials_login_link_check;
alter table public.application_interview_credentials
  add constraint application_interview_credentials_login_link_check
  check (login_link is null or (login_link ~* '^https?://' and length(login_link) <= 2000));
