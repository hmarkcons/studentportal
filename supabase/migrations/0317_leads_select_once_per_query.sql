-- Who may read a lead, worked out once per query instead of once per lead.
--
-- leads_select (0065) asked, for every row:
--
--   assigned_counselor_id = auth.uid()
--   or has_role(array['management','super_admin','marketing','digital_marketing'])
--   or staff_can_view_student(id)
--
-- has_role() and staff_can_view_student() are each a query of their own, and
-- Postgres ran them for every lead it looked at. A Super Admin passes at the
-- second and stops there; a counsellor, whose own leads are a few of the
-- 2,804, fails both on nearly every row, so counting the leads they may see
-- took three sub-queries a row — 2.5 seconds for a plain count, measured,
-- against 0.3 for a Super Admin. The leads list counts on every load, and
-- counsellors are the people who use it.
--
-- staff_can_view_student(id) asks about the very row being checked: it is
-- true when that lead's counsellor is the viewer, or the viewer is
-- management, a Super Admin, processing or finance. So the policy is the same
-- as: the viewer is the lead's counsellor, or holds one of those six roles.
-- Written that way, with auth.uid() and has_role() inside (select …), Postgres
-- works each out once for the whole query (an InitPlan) and the per-row check
-- is a comparison. leads_select_self gets the same treatment.
--
-- Nobody gains or loses a lead by this, and the migration proves it rather
-- than trusting the reasoning: it records exactly which leads every staff
-- member and every student with a login can read, replaces the policies,
-- records it again, and refuses — rolling everything back — if any one
-- person's set differs.

create temp table _leads_visible (person_id uuid, phase text, n bigint, digest text) on commit drop;

-- Reads the leads as each person would: as the authenticated role, with their
-- id where auth.uid() looks for it, so RLS applies exactly as it does to them.
create or replace function pg_temp.record_leads_visibility(p_phase text) returns void
language plpgsql as $$
declare
  p record;
  v_n bigint;
  v_digest text;
begin
  for p in
    select id from public.staff
    union
    select auth_user_id from public.leads where auth_user_id is not null
  loop
    perform set_config('request.jwt.claim.sub', p.id::text, true);
    perform set_config('request.jwt.claims', json_build_object('sub', p.id, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    select count(*), md5(coalesce(string_agg(l.id::text, ',' order by l.id), '')) into v_n, v_digest from public.leads l;
    execute 'reset role';
    insert into _leads_visible values (p.id, p_phase, v_n, v_digest);
  end loop;
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('request.jwt.claims', '', true);
end;
$$;

select pg_temp.record_leads_visibility('before');

drop policy if exists "leads_select" on leads;
create policy "leads_select" on leads for select
  using (
    assigned_counselor_id = (select auth.uid())
    or (select has_role(array['management', 'super_admin', 'marketing', 'digital_marketing', 'processing', 'finance']::staff_role[]))
  );

drop policy if exists "leads_select_self" on leads;
create policy "leads_select_self" on leads for select
  using (auth_user_id = (select auth.uid()));

select pg_temp.record_leads_visibility('after');

do $$
declare
  v_people bigint;
  v_changed bigint;
  v_partial bigint;
  v_total bigint;
begin
  select count(*) into v_total from public.leads;
  select count(*) into v_people from _leads_visible where phase = 'before';
  select count(*) into v_changed
  from _leads_visible b
  left join _leads_visible a on a.person_id = b.person_id and a.phase = 'after'
  where b.phase = 'before' and (a.person_id is null or a.n <> b.n or a.digest <> b.digest);
  -- Somebody who sees some leads but not all, so the comparison is not
  -- between "everything" and "everything".
  select count(*) into v_partial from _leads_visible where phase = 'before' and n > 0 and n < v_total;

  if v_people = 0 then
    raise exception '0317: nobody was checked — nothing changed.';
  end if;
  if v_changed > 0 then
    raise exception '0317: % of % people would see different leads — nothing changed.', v_changed, v_people;
  end if;
  raise notice '0317: % people checked, each sees exactly the leads they did (% of them a part of the %).', v_people, v_partial, v_total;
end;
$$;
