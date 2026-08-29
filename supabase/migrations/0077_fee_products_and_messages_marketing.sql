-- Two more instances of the same silent-RLS bug class as 0075/0076, found
-- sweeping every write path in src/lib/actions against its backing policy.

-- 1. fee_products_write (0056) never included processing, but
--    requireProcessingOrAbove() (consultancyFee.ts) gates create/update/
--    deleteFeeProduct at super_admin/finance/processing — every sibling
--    policy that same gate touches (invoice_line_items_write,
--    invoices_write, invoice_email_log_write, all in 0056) already
--    includes processing. A processing-role staff member on
--    /finance/consultancy-fee passes the app's own check, then hits a real
--    RLS rejection on insert or a silent no-op on update/delete.
drop policy if exists "fee_products_write" on fee_products;
create policy "fee_products_write" on fee_products for all
  using (has_role(array['super_admin', 'finance', 'processing']::staff_role[]))
  with check (has_role(array['super_admin', 'finance', 'processing']::staff_role[]));

-- 2. messages_select_staff/messages_insert_staff (0014) only ever granted
--    entity_type='student' access via staff_can_view_student(), which
--    excludes marketing/digital_marketing — but /marketing/broadcast
--    (messages.ts's broadcastMessage/sendMessage) is explicitly built for
--    those roles to bulk-message students they can already see via
--    leads_select's own marketing branch (0007/0065), and has no app-level
--    role gate of its own. A marketing or digital_marketing staff member
--    could see and select students on that page, but every insert into
--    `messages` was rejected outright by RLS — the broadcast feature never
--    worked for its primary intended role.
drop policy if exists "messages_select_staff" on messages;
create policy "messages_select_staff" on messages for select
  using (
    (
      entity_type = 'student'
      and (staff_can_view_student(entity_id) or has_role(array['marketing', 'digital_marketing']::staff_role[]))
    )
    or (entity_type = 'university' and is_active_staff())
  );

drop policy if exists "messages_insert_staff" on messages;
create policy "messages_insert_staff" on messages for insert
  with check (
    (
      entity_type = 'student'
      and (staff_can_view_student(entity_id) or has_role(array['marketing', 'digital_marketing']::staff_role[]))
    )
    or (entity_type = 'university' and is_active_staff())
  );
