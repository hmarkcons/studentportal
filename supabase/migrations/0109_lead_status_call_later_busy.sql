-- Two more lead pipeline statuses. ALTER TYPE ... ADD VALUE can't run in the
-- same transaction as anything that references the new value, so this stays
-- its own migration, applied before any code (or a later migration) uses
-- 'call_later'/'busy'.
alter type lead_status add value if not exists 'call_later';
alter type lead_status add value if not exists 'busy';
