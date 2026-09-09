-- Stops inventory quantities being nonsense.
--
-- Two things were possible, both verified against production before writing
-- this:
--
--   * A request for a NEGATIVE quantity was accepted. The form carries
--     min="1", but that is a browser attribute, and requestInventoryItem only
--     rejected a falsy quantity — -5 is truthy. Fulfilling it ran
--     "quantity_on_hand - (-5)", so requesting minus five boxes and having it
--     approved took stock from 10 to 15. Any active staff member could inflate
--     stock, and the request queue would show it as an ordinary fulfilled row.
--
--   * Fulfilling more than exists drove stock negative: 2 - 100 = -98. There
--     is no such thing as minus ninety-eight boxes of anything, and a low
--     stock badge computed from it is meaningless.
--
-- Fixed at the database rather than only in the action, so it holds whichever
-- client writes — that is exactly what the browser-only min="1" failed to do.
--
-- Two other things while here:
--
--   * inventory_requests.requested_by referenced staff with NO ACTION, so a
--     staff member who had ever requested a box of pens could not be deleted.
--     Same as audit_log.actor_id in 0136 and resolved the same way: history
--     survives the person, so ON DELETE SET NULL.
--
--   * item_id is ON DELETE SET NULL, so deleting an item leaves its requests
--     pointing at nothing and the queue renders them as "Item × 5". The name
--     is snapshotted at request time now, which also keeps history honest if
--     an item is later renamed — a request should say what was asked for when
--     it was asked for.

-- The threshold constraint below refused to apply, which turned up a real bad
-- value: "Tea Bags" carried a low_stock_threshold of -1. The badge fires on
-- "quantity_on_hand <= low_stock_threshold", so a negative threshold can never
-- be true — that item could never report low stock however empty it got.
--
-- Somebody almost certainly typed -1 meaning "don't warn me about this one",
-- and NULL is exactly how this schema already says that: the badge is skipped
-- when the threshold is null. So a negative threshold is normalised to null,
-- which keeps the intent instead of inventing a number.
update public.inventory_items
set low_stock_threshold = null
where low_stock_threshold is not null and low_stock_threshold < 0;

alter table public.inventory_items
  drop constraint if exists inventory_items_quantity_on_hand_check;
alter table public.inventory_items
  add constraint inventory_items_quantity_on_hand_check check (quantity_on_hand >= 0);

alter table public.inventory_items
  drop constraint if exists inventory_items_low_stock_threshold_check;
alter table public.inventory_items
  add constraint inventory_items_low_stock_threshold_check
  check (low_stock_threshold is null or low_stock_threshold >= 0);

alter table public.inventory_requests
  drop constraint if exists inventory_requests_quantity_check;
alter table public.inventory_requests
  add constraint inventory_requests_quantity_check check (quantity > 0);

alter table public.inventory_requests
  drop constraint if exists inventory_requests_requested_by_fkey;
alter table public.inventory_requests
  add constraint inventory_requests_requested_by_fkey
  foreign key (requested_by) references public.staff (id) on delete set null;

alter table public.inventory_requests
  add column if not exists item_name text;

-- Backfill so existing rows read correctly even after their item is deleted.
update public.inventory_requests r
set item_name = i.name
from public.inventory_items i
where i.id = r.item_id and r.item_name is null;

-- Fulfilment refuses to overdraw rather than going negative. Still one
-- security-definer function taking the row lock, so the status change and the
-- decrement commit or fail together and two concurrent Fulfill clicks cannot
-- both pass the pending check (migration 0092).
create or replace function public.fulfill_inventory_request(p_request_id uuid, p_status text)
returns void
language plpgsql
security definer
as $function$
declare
  v_request inventory_requests%rowtype;
  v_stock numeric;
  v_name text;
begin
  if not has_role(array['management', 'super_admin']::staff_role[]) then
    raise exception 'Only Management/Super Admin can update requests.';
  end if;
  if p_status not in ('fulfilled', 'rejected') then
    raise exception 'Invalid status.';
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

  update inventory_requests set status = p_status where id = p_request_id;
end;
$function$;
