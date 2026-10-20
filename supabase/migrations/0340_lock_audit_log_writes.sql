-- Close two latent grant/policy holes found in the 2026-10-21 security review.
--
-- H1 (HIGH, verified live-exploitable, unauthenticated): the audit_log INSERT
-- policy was `with check (true)` for PUBLIC, and Supabase's default table
-- grants give both `anon` and `authenticated` INSERT. So anyone holding the
-- public anon key — which ships in the browser bundle — could POST forged rows
-- into audit_log through PostgREST without signing in: fabricate history, forge
-- attribution onto a real staff member, flood the log, or plant a forged
-- `DELETE` of a `staff` row whose `before` names `roles:[super_admin]` as bait
-- for a Super Admin's one-click restore (audit_restore runs as definer with the
-- target's triggers disabled). Confirmed by inserting and reading back a forged
-- row as both a counselor session and the bare anon key, then deleting it.
--
-- The real audit path is unaffected: every audit row is written by the
-- `log_audit_event()` trigger, which is SECURITY DEFINER and so runs as the
-- function owner — bypassing both RLS and these grants. There is no
-- FORCE ROW LEVEL SECURITY on the table and no app code inserts audit_log
-- directly, so removing the role-level write path removes only the attack.
--
-- audit_log has no UPDATE or DELETE policy, so existing rows were already
-- un-tamperable via PostgREST; the matching grants are revoked here too for
-- completeness. SELECT stays granted to `authenticated` because the Super Admin
-- reads the log through the app as that role — the `audit_log_select` policy
-- (is_super_admin()) is what actually scopes those reads.

drop policy if exists "audit_log_insert" on public.audit_log;

revoke insert, update, delete, truncate, references on public.audit_log from authenticated;
revoke all on public.audit_log from anon;

-- L4 (LOW, latent): stale grants that currently leak nothing — `students` is a
-- security_invoker view over `leads` (so anon's own privileges + leads RLS
-- apply, yielding nothing) and get_partner_applications keys off auth.uid()
-- (null for anon) — but granting write-to-students and a student-PII function
-- to the anonymous role is a footgun. The signed-in app uses `authenticated`,
-- never `anon`, so dropping the anon grants changes nothing the app relies on.
revoke all on public.students from anon;
revoke execute on function public.get_partner_applications() from anon;
