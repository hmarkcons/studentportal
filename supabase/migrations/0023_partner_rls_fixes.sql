-- HMARK CRM rebuild — step 19: real bugs found during end-to-end testing.
--
-- Root cause (confirmed via EXPLAIN): PostgreSQL requires a row to satisfy
-- BOTH the UPDATE policy's USING clause AND the table's applicable SELECT
-- policy's USING clause for an UPDATE/DELETE to touch it (it has to be able
-- to "see" the row). `applications_select_partner_full` only granted
-- visibility when student_visibility_mode = 'full', so in the default
-- 'summary' mode a partner had NO select policy at all — meaning
-- `applications_update_partner` silently matched zero rows. Not a security
-- leak (nothing was exposed or changed), but the whole "partner updates
-- application stage" feature was non-functional. The same missing
-- visibility cascaded into partner_commissions (nested EXISTS-on-
-- applications), student_documents inserts (same pattern), and the
-- commission-proof storage policy (nested two levels deep).
--
-- Separately: subqueries inside a policy or trigger that read ANOTHER
-- RLS-protected table are themselves subject to THAT table's RLS for the
-- current caller, unless wrapped in a SECURITY DEFINER function.
-- validate_application_stage() queries destinations/universities directly
-- (plain plpgsql, not security definer) — for a partner caller this made
-- `allowed` resolve to NULL, and a NULL condition is falsy in PL/pgSQL, so
-- the trigger silently skipped its own validation instead of enforcing it.
--
-- Run after 0022_leads_student_self_access.sql.

-- Fix 1: a plain SELECT policy on `universities` for a partner's own
-- university. Not sensitive data (name/type/status/visibility-mode), and
-- needed so nested policy subqueries that join `universities` (e.g.
-- student_documents_select_partner_full) can actually resolve.
create policy "universities_select_partner" on universities for select
  using (id = partner_university_id());

-- Fix 2: applications table columns (university_id, program_id, intake,
-- current_stage) aren't the sensitive part of "full vs summary" visibility
-- — the doc's distinction is about the STUDENT's personal info, which
-- get_partner_applications() already gates correctly at the field level.
-- Replace the mode-gated (and broken) select policy with an unconditional
-- one scoped to the partner's own university, which also fixes the
-- UPDATE-requires-SELECT problem above.
drop policy if exists "applications_select_partner_full" on applications;
create policy "applications_select_partner" on applications for select
  using (university_id = partner_university_id());

-- Fix 3: validate_application_stage() must bypass RLS on destinations/
-- universities to read pipeline_stages regardless of who's updating the
-- row — it's a read for validation purposes, not data exposed to the caller.
create or replace function validate_application_stage() returns trigger
language plpgsql security definer as $$
declare
  dest_id uuid;
  allowed jsonb;
begin
  select u.destination_id into dest_id from universities u where u.id = new.university_id;
  select d.pipeline_stages into allowed from destinations d where d.id = dest_id;

  if new.current_stage is null then
    new.current_stage := allowed ->> 0;
  end if;

  if new.current_stage not in ('rejected', 'declined', 'withdrawn') and not (allowed ? new.current_stage) then
    raise exception 'Stage "%" is not part of this destination''s configured pipeline', new.current_stage;
  end if;

  return new;
end;
$$;

-- Fix 4 (defensive): same class of issue — make the partner-commission
-- update guard's internal lookup independent of the caller's own RLS.
create or replace function restrict_partner_commission_updates() returns trigger
language plpgsql security definer as $$
declare
  v_partner_uni uuid;
  v_app_uni uuid;
begin
  v_partner_uni := partner_university_id();
  if v_partner_uni is null then
    return new;
  end if;
  select university_id into v_app_uni from applications where id = old.application_id;
  if v_app_uni = v_partner_uni then
    if new.paid_fee is distinct from old.paid_fee
      or new.rate_percent is distinct from old.rate_percent
      or new.fixed_amount is distinct from old.fixed_amount
      or new.expected_amount is distinct from old.expected_amount
      or new.assigned_counselor_id is distinct from old.assigned_counselor_id
      or new.currency is distinct from old.currency
      or new.student_id is distinct from old.student_id
      or new.application_id is distinct from old.application_id
    then
      raise exception 'Partner university accounts may only update payment/dispute fields';
    end if;
  end if;
  return new;
end;
$$;
