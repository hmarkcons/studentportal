-- updateInventoryRequestStatus() (src/lib/actions/inventory.ts) read a
-- request's status, wrote the new status, then separately read and wrote
-- quantity_on_hand with no row lock between the read and the write and no
-- error check on the final update. Two concurrent "fulfill" clicks on the
-- same request could both pass the pending-check before either status-write
-- landed (double-decrementing stock for one fulfillment), and a failed
-- decrement left the request marked "fulfilled" while quantity_on_hand
-- silently never dropped, permanently desyncing tracked stock with no
-- trace. Same shape as the invoice/commission-credit bugs already fixed —
-- one security-definer function, with the request row locked (`for update`)
-- for the duration.
create or replace function fulfill_inventory_request(p_request_id uuid, p_status text) returns void
language plpgsql security definer as $$
declare
  v_request inventory_requests%rowtype;
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

  update inventory_requests set status = p_status where id = p_request_id;

  if p_status = 'fulfilled' and v_request.item_id is not null then
    update inventory_items set quantity_on_hand = quantity_on_hand - v_request.quantity where id = v_request.item_id;
  end if;
end;
$$;

grant execute on function fulfill_inventory_request(uuid, text) to authenticated;
