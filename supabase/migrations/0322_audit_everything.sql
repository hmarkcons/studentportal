-- The audit log, for everything people change — and the way back.
--
-- 1. Every table people create, edit or delete in is audited, not eleven: a
--    student's applications, documents, agreements, invoices and payments,
--    tasks, messages, the catalogue, staff, settings. Each event keeps the
--    whole row before and after (as it always has), and now also:
--      row_key       the row's primary key, whatever its columns — so a row
--                    can be found again even where the key is not one uuid;
--      subject       whose it is: a student, a staff member, a university, or
--                    "other" — what the audit log's tabs and per-person logs
--                    are built on;
--      txid          the transaction it happened in: everything a delete took
--                    with it (cascades) shares it, and comes back with it;
--      changed       the fields an edit changed;
--      source_event  the event a restore or a revert undid;
--      internal      a row kept in step by the database itself (a remark's
--                    "current" copy, a stage's history) — restored with its
--                    owner, not shown on its own.
--    An edit that changed nothing but updated_at is not an event.
--
--    Left out: the log itself, alerts, sign-in records, counters that number
--    students and invoices (never to be wound back), stored credentials
--    (secrets have no place in a log), rotating tokens, read markers.
--
-- 2. audit_restore, audit_revert, audit_undo_insert, audit_current_row and
--    audit_subjects — Super Admin only — that the audit log page uses.
--    A restore puts the rows back exactly as they were: the restored tables'
--    own triggers are paused for its transaction (numbering, automation,
--    alerts would otherwise run again as for a new record), foreign keys
--    still enforced, and the restore logged as its own event. A revert is an
--    ordinary edit — its triggers run — of only the fields that change
--    touched; alerts are not sent for either.
--
-- 3. trashed_files: files deleted from storage are kept for 90 days under
--    trash/ (src/lib/fileTrash.ts), so a restore brings the file back too.

do $$
begin
  if to_regclass('public.audit_log') is null then
    raise exception '0322: audit_log is missing';
  end if;
  if to_regprocedure('public.has_role(staff_role[])') is null then
    raise exception '0322: has_role(staff_role[]) is missing';
  end if;
  if to_regprocedure('public.notify(uuid, text, text, text, text, text, text, text, uuid, boolean, boolean)') is null then
    raise exception '0322: notify() (0320) is missing';
  end if;
end $$;

-- 1 -------------------------------------------------------------- the log
alter table public.audit_log
  add column if not exists row_key jsonb,
  add column if not exists subject_type text,
  add column if not exists subject_id uuid,
  add column if not exists txid bigint,
  add column if not exists source_event uuid,
  add column if not exists internal boolean not null default false,
  add column if not exists changed text[];

create index if not exists audit_log_subject_idx on public.audit_log (subject_type, subject_id, created_at desc);
create index if not exists audit_log_txid_idx on public.audit_log (txid) where txid is not null;
create index if not exists audit_log_entity_idx on public.audit_log (entity_type, entity_id, created_at desc);
create index if not exists audit_log_created_idx on public.audit_log (created_at desc);

-- Rows the database keeps in step itself: restored with their owner, hidden by default.
create or replace function public.audit_internal(p_table text) returns boolean
language sql immutable as $$
  select p_table = any (array[
    'lead_remark_current', 'application_remark_current', 'application_stage_history',
    'agreement_submission_archive', 'student_document_archive', 'student_assignment_notices',
    'staff_reassignment_log'
  ])
$$;

-- The tables never audited.
create or replace function public.audit_excluded(p_table text) returns boolean
language sql immutable as $$
  select p_table = any (array[
    'audit_log', 'notifications', 'notification_reminders', 'login_events', 'invoice_email_log',
    'student_intake_counters', 'invoice_number_counters', 'student_code_holds',
    'staff_login_credentials', 'partner_login_credentials', 'encrypted_credentials',
    'application_interview_credentials', 'office_qr_tokens', 'scholarship_body_update_runs',
    'message_read_markers', 'support_ticket_read_markers', 'trashed_files'
  ])
$$;

-- The subject a row last had in the log — for a child whose parent went in the same delete.
create or replace function public.audit_prior_subject(p_table text, p_id uuid) returns uuid
language sql stable security definer set search_path = public as $$
  select subject_id from audit_log
  where entity_type = p_table and entity_id = p_id and subject_id is not null
  order by created_at desc limit 1
$$;

create or replace function public.audit_uuid(p_value text) returns uuid
language sql immutable as $$
  select case when p_value ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then p_value::uuid end
$$;

/** Whose a row is: a student (a lead), a staff member, a university — or nobody's in particular. */
create or replace function public.audit_subject(p_table text, p_row jsonb, out subject_type text, out subject_id uuid)
language plpgsql stable security definer set search_path = public as $$
declare
  v uuid;
  ref uuid;
begin
  subject_type := 'other';
  if p_row is null then
    return;
  end if;
  if p_table = 'leads' then
    subject_type := 'student'; subject_id := audit_uuid(p_row ->> 'id'); return;
  elsif p_table = 'staff' then
    subject_type := 'staff'; subject_id := audit_uuid(p_row ->> 'id'); return;
  elsif p_table = 'universities' then
    subject_type := 'university'; subject_id := audit_uuid(p_row ->> 'id'); return;
  elsif p_table = 'messages' then
    subject_id := audit_uuid(p_row ->> 'entity_id');
    subject_type := case p_row ->> 'entity_type' when 'student' then 'student' when 'university' then 'university' else 'other' end;
    return;
  end if;

  v := coalesce(audit_uuid(p_row ->> 'student_id'), audit_uuid(p_row ->> 'lead_id'));
  if v is not null then
    subject_type := 'student'; subject_id := v; return;
  end if;

  ref := audit_uuid(p_row ->> 'application_id');
  if ref is not null then
    select a.student_id into v from applications a where a.id = ref;
    subject_type := 'student'; subject_id := coalesce(v, audit_prior_subject('applications', ref)); return;
  end if;
  ref := audit_uuid(p_row ->> 'interview_id');
  if ref is not null then
    select a.student_id into v from application_interviews i join applications a on a.id = i.application_id where i.id = ref;
    subject_type := 'student'; subject_id := coalesce(v, audit_prior_subject('application_interviews', ref)); return;
  end if;
  ref := audit_uuid(p_row ->> 'invoice_id');
  if ref is not null then
    select i.student_id into v from invoices i where i.id = ref;
    subject_type := 'student'; subject_id := coalesce(v, audit_prior_subject('invoices', ref)); return;
  end if;
  ref := audit_uuid(p_row ->> 'installment_id');
  if ref is not null then
    select i.student_id into v from invoice_installments x join invoices i on i.id = x.invoice_id where x.id = ref;
    subject_type := 'student'; subject_id := coalesce(v, audit_prior_subject('invoice_installments', ref)); return;
  end if;
  ref := audit_uuid(p_row ->> 'agreement_id');
  if ref is not null then
    select a.student_id into v from agreements a where a.id = ref;
    subject_type := 'student'; subject_id := coalesce(v, audit_prior_subject('agreements', ref)); return;
  end if;
  ref := audit_uuid(p_row ->> 'ticket_id');
  if ref is not null then
    select t.student_id into v from support_tickets t where t.id = ref;
    subject_type := 'student'; subject_id := coalesce(v, audit_prior_subject('support_tickets', ref)); return;
  end if;

  v := audit_uuid(p_row ->> 'staff_id');
  if v is not null then
    subject_type := 'staff'; subject_id := v; return;
  end if;
  v := audit_uuid(p_row ->> 'university_id');
  if v is not null then
    subject_type := 'university'; subject_id := v; return;
  end if;
  ref := audit_uuid(p_row ->> 'program_id');
  if ref is not null then
    select p.university_id into v from programs p where p.id = ref;
    subject_type := 'university'; subject_id := coalesce(v, audit_prior_subject('programs', ref)); return;
  end if;
end;
$$;

/** The audit trigger: the arguments are the table's primary-key columns. */
create or replace function public.log_audit_event() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  old_j jsonb := case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) end;
  new_j jsonb := case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) end;
  rec jsonb := coalesce(new_j, old_j);
  key jsonb := '{}'::jsonb;
  i integer;
  changed_keys text[];
  subj record;
begin
  if tg_op = 'UPDATE' then
    select array_agg(k order by k) into changed_keys
    from jsonb_object_keys(new_j) k
    where k <> 'updated_at' and (new_j -> k) is distinct from (old_j -> k);
    -- Nothing but the clock moved: not an event.
    if changed_keys is null then
      return new;
    end if;
  end if;

  if tg_nargs = 0 then
    key := jsonb_build_object('id', rec -> 'id');
  else
    for i in 0 .. tg_nargs - 1 loop
      key := key || jsonb_build_object(tg_argv[i], rec -> tg_argv[i]);
    end loop;
  end if;

  subj := audit_subject(tg_table_name, rec);
  insert into audit_log (actor_id, action_type, entity_type, entity_id, row_key, before, after,
                         subject_type, subject_id, txid, source_event, internal, changed)
  values (
    auth.uid(), tg_op, tg_table_name,
    case when tg_nargs <= 1 then audit_uuid(rec ->> coalesce(tg_argv[0], 'id')) end,
    key, old_j, new_j, subj.subject_type, subj.subject_id, txid_current(),
    audit_uuid(nullif(current_setting('app.audit_source_event', true), '')),
    audit_internal(tg_table_name), changed_keys
  );
  return coalesce(new, old);
end;
$$;

-- What the log already holds, given the key and the subject it was written
-- without: every audited table before now keyed on one uuid column.
update public.audit_log a
set row_key = jsonb_build_object(
      case a.entity_type when 'student_profiles' then 'student_id' when 'program_commission_rates' then 'program_id' else 'id' end,
      a.entity_id),
    subject_type = (public.audit_subject(a.entity_type, coalesce(a.after, a.before))).subject_type,
    subject_id = (public.audit_subject(a.entity_type, coalesce(a.after, a.before))).subject_id
where a.row_key is null and a.entity_id is not null;

-- Every table people change, by its primary key. One with no primary key
-- could not be found again, so it is not audited.
do $$
declare
  t record;
  pk text[];
begin
  for t in
    select c.oid, c.relname
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r' and not audit_excluded(c.relname)
  loop
    select array_agg(a.attname::text order by array_position(i.indkey::int2[], a.attnum)) into pk
    from pg_index i join pg_attribute a on a.attrelid = i.indrelid and a.attnum = any (i.indkey)
    where i.indrelid = t.oid and i.indisprimary;
    if pk is null then
      continue;
    end if;
    execute format('drop trigger if exists %I on public.%I', 'trg_audit_' || t.relname, t.relname);
    execute format(
      'create trigger %I after insert or update or delete on public.%I for each row execute function public.log_audit_event(%s)',
      'trg_audit_' || t.relname, t.relname, (select string_agg(quote_literal(c), ', ') from unnest(pk) c)
    );
  end loop;
end $$;

-- 2 ------------------------------------------------------- the way back
-- No alerts for a restore or a revert: it puts right what was, it is not news.
create or replace function public.audit_action_running() returns boolean
language sql stable as $$
  select coalesce(current_setting('app.audit_action', true), '') = 'on'
$$;

-- notify() (0320) learns to stay quiet during one.
do $$
declare
  src text;
begin
  select pg_get_functiondef('public.notify(uuid, text, text, text, text, text, text, text, uuid, boolean, boolean)'::regprocedure) into src;
  if position('audit_action_running' in src) = 0 then
    src := replace(src, 'if p_user is null or p_user = auth.uid() then', 'if p_user is null or p_user = auth.uid() or audit_action_running() then');
    if position('audit_action_running' in src) = 0 then
      raise exception '0322: could not teach notify() to stay quiet during a restore';
    end if;
    execute src;
  end if;
end $$;

/** "t.a = … and t.b = …" for a row's key, each value cast to its column's type. */
create or replace function public.audit_key_condition(p_table text, p_key jsonb) returns text
language sql stable as $$
  select string_agg(format('t.%I = (select r.%I from jsonb_populate_record(null::public.%I, %L::jsonb) r)', k, k, p_table, p_key::text), ' and ')
  from jsonb_object_keys(p_key) k
$$;

/** The columns of a table a snapshot can be written back to: present in it, not generated. */
create or replace function public.audit_columns(p_table text, p_row jsonb) returns text
language sql stable as $$
  select string_agg(quote_ident(a.attname), ', ' order by a.attnum)
  from pg_attribute a
  where a.attrelid = ('public.' || quote_ident(p_table))::regclass
    and a.attnum > 0 and not a.attisdropped and a.attgenerated = '' and p_row ? a.attname
$$;

create or replace function public.audit_require_super_admin() returns void
language plpgsql stable security definer set search_path = public as $$
begin
  if not has_role(array['super_admin']::staff_role[]) then
    raise exception 'Only a Super Admin can do this from the audit log.';
  end if;
end;
$$;

/** The row an event is about, as it is now; null once it is gone. */
create or replace function public.audit_current_row(p_event uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  ev audit_log;
  cur jsonb;
begin
  perform audit_require_super_admin();
  select * into ev from audit_log where id = p_event;
  if ev.id is null or ev.row_key is null or to_regclass('public.' || quote_ident(ev.entity_type)) is null then
    return null;
  end if;
  execute format('select to_jsonb(t) from public.%I t where %s', ev.entity_type, audit_key_condition(ev.entity_type, ev.row_key)) into cur;
  return cur;
end;
$$;

/** The deletions a restore of this one brings back with it: the same transaction, the same subject. */
create or replace function public.audit_restore_group(p_event uuid) returns setof audit_log
language plpgsql stable security definer set search_path = public as $$
declare
  ev audit_log;
begin
  perform audit_require_super_admin();
  select * into ev from audit_log where id = p_event;
  if ev.id is null then
    return;
  end if;
  if ev.txid is null then
    return query select * from audit_log where id = ev.id;
    return;
  end if;
  return query
    select * from audit_log a
    where a.txid = ev.txid and a.action_type = 'DELETE' and a.row_key is not null
      and (a.id = ev.id or (a.subject_type is not distinct from ev.subject_type and a.subject_id is not distinct from ev.subject_id))
    order by a.created_at, a.id;
end;
$$;

/**
 * Brings back a deleted row, and what was deleted with it, exactly as they
 * were. Returns what came back, for the files to follow.
 */
create or replace function public.audit_restore(p_event uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  ev audit_log;
  r audit_log;
  pending uuid[];
  tables text[];
  t text;
  progress boolean;
  exists_now boolean;
  row_data jsonb;
  cols text;
  restored jsonb := '[]'::jsonb;
  failure text;
  v_constraint text;
  auth_col text;
  attempt integer;
begin
  perform audit_require_super_admin();
  select * into ev from audit_log where id = p_event;
  if ev.id is null or ev.action_type <> 'DELETE' then
    raise exception 'Only a deletion can be restored.';
  end if;
  if ev.row_key is null then
    raise exception 'This deletion was logged before the audit log kept what is needed to restore it.';
  end if;

  select array_agg(id) into pending from audit_restore_group(p_event);
  select array_agg(distinct entity_type) into tables from audit_log where id = any (pending);

  perform set_config('app.audit_action', 'on', true);
  foreach t in array tables loop
    if to_regclass('public.' || quote_ident(t)) is null then
      raise exception 'The % table no longer exists, so its rows cannot come back.', t;
    end if;
    execute format('alter table public.%I disable trigger user', t);
  end loop;

  loop
    progress := false;
    for r in select * from audit_log where id = any (pending) order by created_at, id loop
      execute format('select exists (select 1 from public.%I t where %s)', r.entity_type, audit_key_condition(r.entity_type, r.row_key)) into exists_now;
      if exists_now then
        pending := array_remove(pending, r.id);
        continue;
      end if;
      row_data := r.before;
      for attempt in 1 .. 3 loop
        begin
          cols := audit_columns(r.entity_type, row_data);
          execute format('insert into public.%I (%s) select %s from jsonb_populate_record(null::public.%I, $1)', r.entity_type, cols, cols, r.entity_type)
            using row_data;
          insert into audit_log (actor_id, action_type, entity_type, entity_id, row_key, before, after,
                                 subject_type, subject_id, txid, source_event, internal)
          values (auth.uid(), 'RESTORE', r.entity_type, r.entity_id, r.row_key, null, row_data,
                  r.subject_type, r.subject_id, txid_current(), p_event, r.internal);
          restored := restored || jsonb_build_array(jsonb_build_object('table', r.entity_type, 'row', row_data));
          pending := array_remove(pending, r.id);
          progress := true;
          exit;
        exception when foreign_key_violation then
          get stacked diagnostics v_constraint = constraint_name;
          -- A sign-in deleted with them (auth.users): the record comes back without it.
          select a.attname into auth_col
          from pg_constraint c join pg_attribute a on a.attrelid = c.conrelid and a.attnum = c.conkey[1]
          where c.conname = v_constraint and c.confrelid = 'auth.users'::regclass and c.conrelid = ('public.' || quote_ident(r.entity_type))::regclass;
          if auth_col is not null and not (r.row_key ? auth_col) and row_data ->> auth_col is not null then
            row_data := jsonb_set(row_data, array[auth_col], 'null'::jsonb);
            continue;
          end if;
          -- Its parent is not back yet: the next pass.
          exit;
        end;
      end loop;
    end loop;
    exit when not progress or cardinality(pending) = 0;
  end loop;

  foreach t in array tables loop
    execute format('alter table public.%I enable trigger user', t);
  end loop;

  if ev.id = any (pending) then
    select format('%s could not be restored: something it belongs to is gone and was not deleted with it%s.', initcap(replace(ev.entity_type, '_', ' ')),
      case when ev.entity_type = 'staff' then ' (a staff member''s sign-in is deleted with them; add them again from Staff)' else '' end)
      into failure;
    raise exception '%', failure;
  end if;
  return jsonb_build_object('restored', restored, 'left', coalesce(cardinality(pending), 0));
end;
$$;

/**
 * Takes back one edit: the fields it changed, set back to what they were —
 * nothing else. An ordinary edit, its triggers running; no alerts sent.
 */
create or replace function public.audit_revert(p_event uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  ev audit_log;
  keys text[];
  cur jsonb;
  cols text;
begin
  perform audit_require_super_admin();
  select * into ev from audit_log where id = p_event;
  if ev.id is null or ev.action_type <> 'UPDATE' then
    raise exception 'Only an edit can be reverted.';
  end if;
  if ev.row_key is null then
    raise exception 'This edit was logged before the audit log kept what is needed to revert it.';
  end if;
  keys := coalesce(ev.changed, (
    select array_agg(k) from jsonb_object_keys(ev.after) k
    where k <> 'updated_at' and (ev.after -> k) is distinct from (ev.before -> k)
  ));
  -- The key itself is never rewritten here.
  keys := array(select k from unnest(keys) k where not (ev.row_key ? k) and ev.before ? k);
  if cardinality(keys) = 0 then
    raise exception 'That edit changed nothing that can be set back.';
  end if;

  execute format('select to_jsonb(t) from public.%I t where %s', ev.entity_type, audit_key_condition(ev.entity_type, ev.row_key)) into cur;
  if cur is null then
    raise exception 'It has been deleted since — restore it first, then revert.';
  end if;

  perform set_config('app.audit_action', 'on', true);
  perform set_config('app.audit_source_event', p_event::text, true);
  select string_agg(quote_ident(k), ', ') into cols from unnest(keys) k;
  execute format(
    'update public.%I t set (%s) = (select %s from jsonb_populate_record(null::public.%I, $1) r) where %s',
    ev.entity_type, cols, (select string_agg('r.' || quote_ident(k), ', ') from unnest(keys) k), ev.entity_type,
    audit_key_condition(ev.entity_type, ev.row_key)
  ) using ev.before;
  perform set_config('app.audit_source_event', '', true);
  return jsonb_build_object('reverted', to_jsonb(keys), 'before', ev.before);
end;
$$;

/** Takes back an addition: the row added is deleted (and can be restored from that deletion). */
create or replace function public.audit_undo_insert(p_event uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  ev audit_log;
  n integer;
begin
  perform audit_require_super_admin();
  select * into ev from audit_log where id = p_event;
  if ev.id is null or ev.action_type not in ('INSERT', 'RESTORE') then
    raise exception 'Only an addition can be taken back.';
  end if;
  if ev.row_key is null then
    raise exception 'This addition was logged before the audit log kept what is needed to take it back.';
  end if;
  perform set_config('app.audit_action', 'on', true);
  perform set_config('app.audit_source_event', p_event::text, true);
  execute format('delete from public.%I t where %s', ev.entity_type, audit_key_condition(ev.entity_type, ev.row_key));
  get diagnostics n = row_count;
  perform set_config('app.audit_source_event', '', true);
  if n = 0 then
    raise exception 'It is not there any more.';
  end if;
  return jsonb_build_object('removed', n);
end;
$$;

/**
 * The people and places the audit log's tabs list: each subject with its
 * name (from the record, or from the log when it has been deleted), how many
 * events and when the last was.
 */
create or replace function public.audit_subjects(p_kind text, p_search text default null, p_limit integer default 60, p_offset integer default 0)
returns table (subject_id uuid, entity text, label text, sublabel text, events bigint, last_at timestamptz, deleted boolean)
language plpgsql stable security definer set search_path = public as $$
declare
  q text := nullif(btrim(coalesce(p_search, '')), '');
begin
  perform audit_require_super_admin();
  if p_kind in ('student', 'lead') then
    return query
      with s as (
        select a.subject_id as sid, count(*) as n, max(a.created_at) as at
        from audit_log a where a.subject_type = 'student' and a.subject_id is not null and not a.internal
        group by a.subject_id
      ), snap as (
        select distinct on (a.entity_id) a.entity_id, coalesce(a.after, a.before) as row
        from audit_log a where a.entity_type = 'leads' and a.entity_id in (select sid from s)
        order by a.entity_id, a.created_at desc
      )
      select s.sid, 'leads'::text,
        coalesce(l.full_name, snap.row ->> 'full_name', 'Unknown'),
        coalesce(l.student_code, snap.row ->> 'student_code', l.contact_number, snap.row ->> 'contact_number'),
        s.n, s.at, l.id is null
      from s
      left join leads l on l.id = s.sid
      left join snap on snap.entity_id = s.sid
      where (coalesce(l.status::text, snap.row ->> 'status') = 'registered') = (p_kind = 'student')
        and (q is null or coalesce(l.full_name, snap.row ->> 'full_name', '') ilike '%' || q || '%'
             or coalesce(l.student_code, snap.row ->> 'student_code', '') ilike '%' || q || '%'
             or coalesce(l.contact_number, snap.row ->> 'contact_number', '') ilike '%' || q || '%')
      order by s.at desc
      limit p_limit offset p_offset;
  elsif p_kind = 'staff' then
    return query
      with s as (
        select a.subject_id as sid, count(*) as n, max(a.created_at) as at
        from audit_log a where a.subject_type = 'staff' and a.subject_id is not null and not a.internal
        group by a.subject_id
      ), snap as (
        select distinct on (a.entity_id) a.entity_id, coalesce(a.after, a.before) as row
        from audit_log a where a.entity_type = 'staff' and a.entity_id in (select sid from s)
        order by a.entity_id, a.created_at desc
      )
      select s.sid, 'staff'::text, coalesce(st.full_name, snap.row ->> 'full_name', 'Unknown'),
        coalesce(st.designation, snap.row ->> 'designation', st.role::text, snap.row ->> 'role'), s.n, s.at, st.id is null
      from s left join staff st on st.id = s.sid left join snap on snap.entity_id = s.sid
      where q is null or coalesce(st.full_name, snap.row ->> 'full_name', '') ilike '%' || q || '%'
      order by s.at desc
      limit p_limit offset p_offset;
  elsif p_kind = 'university' then
    return query
      with s as (
        select a.subject_id as sid, count(*) as n, max(a.created_at) as at
        from audit_log a where a.subject_type = 'university' and a.subject_id is not null and not a.internal
        group by a.subject_id
      ), snap as (
        select distinct on (a.entity_id) a.entity_id, coalesce(a.after, a.before) as row
        from audit_log a where a.entity_type = 'universities' and a.entity_id in (select sid from s)
        order by a.entity_id, a.created_at desc
      )
      select s.sid, 'universities'::text, coalesce(u.name, snap.row ->> 'name', 'Unknown'),
        coalesce(u.city, snap.row ->> 'city'), s.n, s.at, u.id is null
      from s left join universities u on u.id = s.sid left join snap on snap.entity_id = s.sid
      where q is null or coalesce(u.name, snap.row ->> 'name', '') ilike '%' || q || '%'
      order by s.at desc
      limit p_limit offset p_offset;
  else
    -- Everything else, by what kind of record it is.
    return query
      select null::uuid, a.entity_type, a.entity_type, null::text, count(*), max(a.created_at), false
      from audit_log a
      where (a.subject_type = 'other' or a.subject_type is null) and not a.internal
        and (q is null or a.entity_type ilike '%' || replace(q, ' ', '_') || '%')
      group by a.entity_type
      order by max(a.created_at) desc
      limit p_limit offset p_offset;
  end if;
end;
$$;

revoke execute on function public.audit_restore(uuid) from public, anon;
revoke execute on function public.audit_revert(uuid) from public, anon;
revoke execute on function public.audit_undo_insert(uuid) from public, anon;
revoke execute on function public.audit_current_row(uuid) from public, anon;
revoke execute on function public.audit_restore_group(uuid) from public, anon;
revoke execute on function public.audit_subjects(text, text, integer, integer) from public, anon;
grant execute on function public.audit_restore(uuid) to authenticated;
grant execute on function public.audit_revert(uuid) to authenticated;
grant execute on function public.audit_undo_insert(uuid) to authenticated;
grant execute on function public.audit_current_row(uuid) to authenticated;
grant execute on function public.audit_restore_group(uuid) to authenticated;
grant execute on function public.audit_subjects(text, text, integer, integer) to authenticated;

-- 3 ----------------------------------------------------- deleted files kept
create table if not exists public.trashed_files (
  id uuid primary key default gen_random_uuid(),
  bucket text not null,
  path text not null,
  trash_path text not null,
  deleted_at timestamptz not null default now(),
  deleted_by uuid,
  restored_at timestamptz
);
create index if not exists trashed_files_path_idx on public.trashed_files (bucket, path) where restored_at is null;
create index if not exists trashed_files_deleted_idx on public.trashed_files (deleted_at);

comment on table public.trashed_files is
  'Files deleted from storage, kept under trash/ for 90 days so a restore from the audit log brings them back (0322). Service role only.';

alter table public.trashed_files enable row level security;
revoke all on public.trashed_files from anon, authenticated;
