-- Receipt numbering: HMC-<intake>-<counter>, e.g. HMC-Fall 2026-101.
--
-- The counter runs per intake and starts at 101, so a number tells you which
-- receipt it is within that intake and the sequence does not leak the total
-- number of students ever registered. A new intake starts again at 101.
--
-- A table rather than a Postgres sequence: sequences cannot be created per
-- intake on demand, and "highest existing number + 1" read from the invoices
-- table would hand the same number to two staff generating at once.

create table if not exists invoice_number_counters (
  -- Case-folded, whitespace-collapsed intake, so "fall 2026" and "Fall  2026"
  -- share one sequence rather than starting two.
  intake_key text primary key,
  -- The intake exactly as staff first typed it, which is what gets printed.
  intake_label text not null,
  next_value integer not null default 101,
  updated_at timestamptz not null default now()
);

alter table invoice_number_counters enable row level security;

-- Only reachable through the security-definer function below; no direct policy
-- is granted, so nothing can hand itself a number out of band.
drop policy if exists "invoice_counters_staff_read" on invoice_number_counters;
create policy "invoice_counters_staff_read" on invoice_number_counters
  for select using (is_active_staff());

-- ---------------------------------------------------------------------------
-- Claim the next number for an intake
-- ---------------------------------------------------------------------------
-- Security definer, and the insert..on conflict..do update is a single
-- statement, so two staff generating receipts at the same moment take a row
-- lock in turn and get 101 and 102 rather than both getting 101.
create or replace function next_invoice_number(p_intake text)
returns text
language plpgsql security definer as $$
declare
  v_label text;
  v_key text;
  v_value integer;
begin
  if not is_active_staff() then
    raise exception 'Only staff can generate a receipt number.';
  end if;

  -- No intake recorded still needs a number, so the year stands in as the
  -- bucket. Better a slightly odd label than a receipt with no reference.
  v_label := nullif(btrim(coalesce(p_intake, '')), '');
  if v_label is null then
    v_label := to_char(now(), 'YYYY');
  end if;
  -- Collapse internal whitespace and strip anything awkward in a file name.
  v_label := btrim(regexp_replace(regexp_replace(v_label, '[\\/:*?"<>|]', '', 'g'), '\s+', ' ', 'g'));
  if v_label = '' then
    v_label := to_char(now(), 'YYYY');
  end if;
  v_key := lower(v_label);

  -- next_value always holds the number to issue NEXT, so the row is written
  -- one ahead and the number issued is RETURNING minus one. That reads the
  -- same on a fresh insert (102 - 1 = 101) and on a conflict (old + 1 - 1 =
  -- old), so there is no special case to get wrong.
  insert into invoice_number_counters (intake_key, intake_label, next_value, updated_at)
  values (v_key, v_label, 102, now())
  on conflict (intake_key) do update
    set next_value = invoice_number_counters.next_value + 1,
        updated_at = now()
  returning intake_label, next_value - 1 into v_label, v_value;

  -- intake_label comes back from the row rather than being reused from the
  -- argument: ON CONFLICT DO UPDATE leaves it at whatever was stored first, so
  -- every receipt in a sequence prints the same spelling even when a later
  -- staff member types "fall 2026" against a run that began as "Fall 2026".
  return 'HMC-' || v_label || '-' || v_value::text;
end; $$;

grant execute on function next_invoice_number(text) to authenticated;
