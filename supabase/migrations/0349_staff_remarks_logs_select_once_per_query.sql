-- The leads list timed out for a counsellor (0349): "canceling statement due
-- to statement timeout", reported 2026-11-04 by a counsellor with 1,884 leads.
--
-- The list reads each lead with its counsellor's name (staff), its current
-- remark (lead_remark_current) and its latest call log (lead_call_logs) in one
-- statement, and the authenticated role has 8 seconds. Measured as that
-- counsellor, the counsellor's name alone took 2.4 seconds for a page of a
-- thousand leads, and the remark 0.9: these tables' policies call auth.uid()
-- and the role functions bare, so Postgres ran them for every row it looked
-- at, and staff_select_for_own_student — there for a student to read their own
-- counsellor — scanned that counsellor's 1,884 leads for every one of the
-- thousand rows. Together with the rest of the list, a busy moment tipped it
-- past 8 seconds.
--
-- 0317 fixed exactly this on leads; these policies were missed. Each is
-- rewritten with auth.uid(), has_role(), is_active_staff() and is_super_admin()
-- inside (select …), so Postgres works each out once per query (an InitPlan)
-- and the per-row check is a comparison — and staff_select_for_own_student's
-- lookup becomes an index probe on leads.auth_user_id (unique) instead of a
-- scan. All four functions are stable and take no row as an argument, so the
-- answer is the same; only how often it is asked changes.
--
-- And, as 0317 did, the migration proves it rather than trusting that: it
-- records exactly which staff rows, remarks and call logs every staff member
-- and every student with a login can read, replaces the policies, records it
-- again, and refuses — rolling everything back — if any one person's set
-- differs.

create temp table _visible (person_id uuid, phase text, tbl text, n bigint, digest text) on commit drop;

-- Reads each table as each person would: as the authenticated role, with their
-- id where auth.uid() looks for it, so RLS applies exactly as it does to them.
create or replace function pg_temp.record_visibility(p_phase text) returns void
language plpgsql as $$
declare
  p record;
  v_staff_n bigint; v_staff_d text;
  v_remark_n bigint; v_remark_d text;
  v_log_n bigint; v_log_d text;
begin
  for p in
    select id from public.staff
    union
    select auth_user_id from public.leads where auth_user_id is not null
  loop
    perform set_config('request.jwt.claim.sub', p.id::text, true);
    perform set_config('request.jwt.claims', json_build_object('sub', p.id, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    select count(*), md5(coalesce(string_agg(s.id::text, ',' order by s.id), '')) into v_staff_n, v_staff_d from public.staff s;
    select count(*), md5(coalesce(string_agg(r.lead_id::text, ',' order by r.lead_id), '')) into v_remark_n, v_remark_d from public.lead_remark_current r;
    select count(*), md5(coalesce(string_agg(c.id::text, ',' order by c.id), '')) into v_log_n, v_log_d from public.lead_call_logs c;
    -- Back to the migration's own role before writing down what they saw: the
    -- authenticated role may not write to this temp table.
    execute 'reset role';
    insert into _visible values
      (p.id, p_phase, 'staff', v_staff_n, v_staff_d),
      (p.id, p_phase, 'lead_remark_current', v_remark_n, v_remark_d),
      (p.id, p_phase, 'lead_call_logs', v_log_n, v_log_d);
  end loop;
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('request.jwt.claims', '', true);
end;
$$;

select pg_temp.record_visibility('before');

-- staff ------------------------------------------------------------------
drop policy if exists "staff_select" on public.staff;
create policy "staff_select" on public.staff for select
  using (
    id = (select auth.uid())
    or (select has_role(array['super_admin', 'management', 'processing', 'finance', 'counselor']::staff_role[]))
  );

-- A student reads their own counsellor and processing officer (0289). With
-- auth.uid() worked out once, this is an index probe on leads.auth_user_id
-- (unique), which for a member of staff finds nothing at once.
drop policy if exists "staff_select_for_own_student" on public.staff;
create policy "staff_select_for_own_student" on public.staff for select
  using (exists (
    select 1 from public.leads l
    where l.auth_user_id = (select auth.uid())
      and (l.assigned_counselor_id = staff.id or l.processing_officer_id = staff.id)
  ));

-- For every command, reads included: Postgres ORs it into every select.
drop policy if exists "staff_write" on public.staff;
create policy "staff_write" on public.staff for all
  using ((select is_super_admin()))
  with check ((select is_super_admin()));

-- lead_remark_current ----------------------------------------------------
drop policy if exists lead_remark_current_select on public.lead_remark_current;
create policy lead_remark_current_select on public.lead_remark_current for select
  using ((select is_active_staff()) and exists (select 1 from public.leads l where l.id = lead_id));

-- lead_call_logs ---------------------------------------------------------
drop policy if exists "lead_call_logs_select" on public.lead_call_logs;
create policy "lead_call_logs_select" on public.lead_call_logs for select
  using (exists (
    select 1 from public.leads l
    where l.id = lead_call_logs.lead_id
      and (l.assigned_counselor_id = (select auth.uid()) or (select has_role(array['management', 'super_admin']::staff_role[])))
  ));

select pg_temp.record_visibility('after');

do $$
declare
  v_people bigint;
  v_changed bigint;
  v_detail text;
begin
  select count(distinct person_id) into v_people from _visible where phase = 'before';
  select count(*), string_agg(distinct b.tbl, ', ') into v_changed, v_detail
  from _visible b
  left join _visible a on a.person_id = b.person_id and a.tbl = b.tbl and a.phase = 'after'
  where b.phase = 'before' and (a.person_id is null or a.n <> b.n or a.digest <> b.digest);

  if v_people = 0 then
    raise exception '0349: nobody was checked — nothing changed.';
  end if;
  if v_changed > 0 then
    raise exception '0349: % person-table reads would differ (%) — nothing changed.', v_changed, v_detail;
  end if;
  raise notice '0349: % people checked on staff, lead_remark_current and lead_call_logs; each reads exactly what they did.', v_people;
end;
$$;
