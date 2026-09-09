-- Attendance recorded what each person wanted it to say, and the QR code
-- proved nothing.
--
-- Checked against production with an ordinary counselor's own session before
-- this was written. All four were accepted:
--
--   - reading office_qr_tokens.token, so the check-in URL can be assembled and
--     "physical presence at the office" recorded from anywhere in the world;
--   - rewriting their own clock_in from 11:30 to 09:00;
--   - clearing their own late_flag;
--   - moving a shift to a different work_date, and inserting a whole shift for
--     a date they were never in.
--
-- attendance_records_update_own granted UPDATE on every column of their own
-- rows, and _insert granted INSERT for staff_id = auth.uid(). Row-level
-- security gates rows, not columns, so "you may close your shift" could not be
-- expressed that way — which is why the punch below moves into a function and
-- the table's write policies come down to Super Admin, who makes corrections.

-- --------------------------------------------------- a shift nobody closed
-- A forgotten clock-out jammed clock-in completely. The open-shift lookup was
-- deliberately not scoped to today (so a stale shift would be found), but
-- clock-in then did nothing at all when it found one, and returned success: a
-- staff member who forgot to clock out on Monday could not clock in again,
-- ever, and the button reported that it had worked. The only way through was
-- to press Clock Out, which stamped Monday's shift with Tuesday's time and
-- produced a thirty-hour day.
--
-- The time somebody left is not recoverable, so this does not invent one.
-- clock_out stays null and the shift is marked as never closed, which is both
-- the truth and something a report can count.
alter table attendance_records
  add column if not exists clock_out_missing boolean not null default false;

comment on column attendance_records.clock_out_missing is
  'The shift was left open past its own day and has been given up on. clock_out stays null because the time is not known.';

-- Any shift already stuck open from a previous day. There is nothing to
-- reconstruct, so they are marked rather than filled in.
update attendance_records
   set clock_out_missing = true
 where clock_out is null
   and clock_out_missing = false
   and work_date < (now() at time zone 'Asia/Karachi')::date;

-- ------------------------------------------------------------- the punch
-- One implementation for the button and the QR, security definer so the
-- caller never needs write access to the table and cannot choose what gets
-- written. Returns what happened, because the buttons used to no-op in
-- silence: pressing Clock In while already clocked in reported success and
-- did nothing, as did Clock Out while not clocked in.
--
-- p_action: 'in', 'out', or 'toggle' (what a QR scan is).
-- p_method: 'button' or 'qr'. A 'qr' punch must carry the current token.
create or replace function attendance_punch(
  p_action text,
  p_method text default 'button',
  p_token uuid default null
) returns table (outcome text, detail text, record_id uuid)
language plpgsql security definer as $$
declare
  v_uid uuid := auth.uid();
  v_today date := (now() at time zone 'Asia/Karachi')::date;
  v_open attendance_records;
  v_new_id uuid;
begin
  if p_action not in ('in', 'out', 'toggle') then
    raise exception 'Unknown attendance action.';
  end if;
  if p_method not in ('button', 'qr') then
    raise exception 'Unknown attendance method.';
  end if;

  if not exists (select 1 from staff s where s.id = v_uid and s.status = 'active') then
    return query select 'not_staff'::text,
      'This login is not an active staff account, so it cannot be used to clock in.'::text, null::uuid;
    return;
  end if;

  -- The token is checked here rather than read by the client, so scanning the
  -- printed sheet remains the only way to hold it.
  if p_method = 'qr' then
    if p_token is null or not exists (select 1 from office_qr_tokens q where q.id and q.token = p_token) then
      return query select 'invalid_token'::text,
        'This QR code is no longer valid — ask a Super Admin to reprint it.'::text, null::uuid;
      return;
    end if;
  end if;

  select * into v_open
    from attendance_records r
   where r.staff_id = v_uid
     and r.clock_out is null
     and r.clock_out_missing = false
   order by r.clock_in desc nulls last
   limit 1;

  -- A shift still open from an earlier day is abandoned, not continued. Doing
  -- this before anything else is what unjams the clock-in.
  if v_open.id is not null and v_open.work_date < v_today then
    update attendance_records set clock_out_missing = true where id = v_open.id;
    v_open := null::attendance_records;
  end if;

  if p_action = 'toggle' then
    p_action := case when v_open.id is null then 'in' else 'out' end;
  end if;

  if p_action = 'in' then
    if v_open.id is not null then
      return query select 'already_in'::text,
        ('You are already clocked in since '
          || to_char(v_open.clock_in at time zone 'Asia/Karachi', 'FMHH12:MI AM') || '.')::text,
        v_open.id;
      return;
    end if;

    insert into attendance_records (staff_id, work_date, clock_in, method)
    values (v_uid, v_today, now(), p_method)
    returning id into v_new_id;

    return query select 'in'::text, 'Clocked in.'::text, v_new_id;
    return;
  end if;

  if v_open.id is null then
    return query select 'not_in'::text,
      'You are not clocked in, so there is nothing to clock out of.'::text, null::uuid;
    return;
  end if;

  update attendance_records set clock_out = now() where id = v_open.id;
  return query select 'out'::text, 'Clocked out.'::text, v_open.id;
end; $$;

grant execute on function attendance_punch(text, text, uuid) to authenticated;

-- --------------------------------------------------------- who may write
-- Ordinary staff punch through the function above, which runs as definer, so
-- they need no direct write access at all — and with none, a timesheet cannot
-- be rewritten by the person it is about. Super Admin keeps both, because
-- somebody has to be able to correct a genuine mistake.
drop policy if exists "attendance_records_insert" on attendance_records;
create policy "attendance_records_insert" on attendance_records
  for insert with check (has_role(array['super_admin']::staff_role[]));

drop policy if exists "attendance_records_update_own" on attendance_records;
drop policy if exists "attendance_records_update" on attendance_records;
create policy "attendance_records_update" on attendance_records
  for update
  using (has_role(array['super_admin']::staff_role[]))
  with check (has_role(array['super_admin']::staff_role[]));

-- ------------------------------------------------------ the office token
-- Every active staff member could read it, which is the whole of the QR
-- code's value: the printed sheet is meant to be the thing you must be
-- standing in front of. Only Super Admin needs it, to render the sheet for
-- printing; the check is done inside attendance_punch, which never returns it.
drop policy if exists "office_qr_tokens_select" on office_qr_tokens;
create policy "office_qr_tokens_select" on office_qr_tokens
  for select using (has_role(array['super_admin']::staff_role[]));

-- The token in circulation has been readable by every staff account for as
-- long as the feature has existed, so it is replaced here. The printed sheet
-- has to be reprinted — which is what "rotate" has always meant.
update office_qr_tokens set token = gen_random_uuid(), updated_at = now() where id;

create index if not exists attendance_records_staff_date_idx
  on attendance_records (staff_id, work_date desc);
