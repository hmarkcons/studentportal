-- A rejected request said "Rejected" and nothing else, nobody recorded who
-- decided it, and a mistaken request could not be taken back.
--
-- The quantity arithmetic was fixed in 0150. What was left is the part of the
-- queue that is a conversation between two people: someone asks for five boxes
-- of pens, and the only thing that ever comes back is a red badge. They cannot
-- tell whether the answer is "out of stock until Monday", "that is far too
-- many", or "buy it yourself" — the same defect that was fixed for student
-- documents (a rejection with no reason) and for support tickets.
--
-- No requests exist in production yet, so nothing needs migrating.

-- ------------------------------------------------------------ the decision
alter table inventory_requests add column if not exists decision_note text;
alter table inventory_requests add column if not exists decided_by uuid;
alter table inventory_requests add column if not exists decided_at timestamptz;

-- History outlives the person, as with audit_log.actor_id (0136) and
-- requested_by (0150).
alter table inventory_requests drop constraint if exists inventory_requests_decided_by_fkey;
alter table inventory_requests
  add constraint inventory_requests_decided_by_fkey
  foreign key (decided_by) references staff (id) on delete set null;

comment on column inventory_requests.decision_note is
  'Why the request was rejected, or an optional note on a fulfilment. Required on a rejection.';

-- ------------------------------------------------------------- cancelling
-- A request raised by mistake — the wrong item, or 50 where 5 was meant — had
-- no way back. UPDATE and DELETE are both Management/Super Admin, so the
-- person who raised it had to ask somebody else to clear up after them, and in
-- the meantime the queue showed a request nobody wanted decided.
--
-- A fourth status rather than a delete, so the queue's history stays honest
-- about what was asked for and withdrawn.
alter table inventory_requests drop constraint if exists inventory_requests_status_check;
alter table inventory_requests
  add constraint inventory_requests_status_check
  check (status in ('pending', 'fulfilled', 'rejected', 'cancelled'));

-- --------------------------------------------------------------- lengths
-- Neither field had a limit. Same reasoning as the ticket bodies in 0156: a
-- pasted document would be stored and then rendered into the queue on every
-- visit. A request note is a line, not a document.
alter table inventory_requests drop constraint if exists inventory_requests_notes_length;
alter table inventory_requests
  add constraint inventory_requests_notes_length
  check (notes is null or (btrim(notes) <> '' and length(notes) <= 500));

alter table inventory_requests drop constraint if exists inventory_requests_decision_note_length;
alter table inventory_requests
  add constraint inventory_requests_decision_note_length
  check (decision_note is null or (btrim(decision_note) <> '' and length(decision_note) <= 500));

-- ------------------------------------------------------------- deciding
-- Carried forward from 0150 with the note, the decider and the time. The
-- two-argument version is dropped rather than left beside it, so there is one
-- way to decide a request and it cannot be called without a reason.
drop function if exists public.fulfill_inventory_request(uuid, text);

create or replace function public.fulfill_inventory_request(
  p_request_id uuid,
  p_status text,
  p_note text default null
)
returns void
language plpgsql
security definer
as $function$
declare
  v_request inventory_requests%rowtype;
  v_stock numeric;
  v_name text;
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
begin
  if not has_role(array['management', 'super_admin']::staff_role[]) then
    raise exception 'Only Management/Super Admin can update requests.';
  end if;
  if p_status not in ('fulfilled', 'rejected') then
    raise exception 'Invalid status.';
  end if;

  -- A rejection without a reason leaves the requester with a red badge and
  -- nothing to act on. Fulfilling needs no explanation; refusing does.
  if p_status = 'rejected' and v_note is null then
    raise exception 'Say why it is being turned down — the person who asked sees this and has nothing else to go on.';
  end if;
  if v_note is not null and length(v_note) > 500 then
    raise exception 'Keep the note under 500 characters.';
  end if;

  select * into v_request from inventory_requests where id = p_request_id for update;
  if v_request.id is null then
    raise exception 'Request not found.';
  end if;
  if v_request.status <> 'pending' then
    raise exception 'This request has already been decided.';
  end if;

  -- The quantity CHECK covers anything written from now on; this guards a row
  -- that predates it, so an old negative request cannot still be fulfilled
  -- into a stock increase.
  if v_request.quantity <= 0 then
    raise exception 'This request is for % — a quantity has to be greater than zero. Reject it and raise a new one.', v_request.quantity;
  end if;

  if p_status = 'fulfilled' and v_request.item_id is not null then
    -- Locked in the same statement order as the request, so a concurrent
    -- fulfilment of another request for the same item cannot slip between the
    -- check and the decrement and take stock negative between them.
    select quantity_on_hand, name into v_stock, v_name
    from inventory_items where id = v_request.item_id for update;

    if v_stock < v_request.quantity then
      raise exception 'Only % of % left in stock, and this request is for %. Adjust the stock figure first if more has arrived.',
        v_stock, v_name, v_request.quantity;
    end if;

    update inventory_items
    set quantity_on_hand = quantity_on_hand - v_request.quantity
    where id = v_request.item_id;
  end if;

  update inventory_requests
     set status = p_status,
         decision_note = v_note,
         decided_by = auth.uid(),
         decided_at = now()
   where id = p_request_id;
end;
$function$;

grant execute on function public.fulfill_inventory_request(uuid, text, text) to authenticated;

-- ------------------------------------------------------------ withdrawing
-- The requester's own pending request, and nothing else. Security definer
-- because UPDATE on the table is Management/Super Admin — which is right for
-- deciding a request and wrong for taking your own back.
create or replace function public.cancel_inventory_request(p_request_id uuid)
returns void
language plpgsql
security definer
as $function$
declare
  v_request inventory_requests%rowtype;
begin
  select * into v_request from inventory_requests where id = p_request_id for update;
  if v_request.id is null then
    raise exception 'Request not found.';
  end if;
  if v_request.requested_by is distinct from auth.uid() then
    raise exception 'Only the person who raised a request can withdraw it.';
  end if;
  if v_request.status <> 'pending' then
    raise exception 'This request has already been decided, so there is nothing to withdraw.';
  end if;

  update inventory_requests
     set status = 'cancelled',
         decided_at = now(),
         decided_by = auth.uid()
   where id = p_request_id;
end;
$function$;

grant execute on function public.cancel_inventory_request(uuid) to authenticated;

create index if not exists inventory_requests_status_created_idx
  on inventory_requests (status, created_at);
