-- program_commission_rates (migration 0008) and programs.tuition_fee already
-- exist specifically to drive partner-commission math, but nothing in the
-- app reads or writes them yet — Finance has been retyping each partner
-- commission's rate/amount from memory. This adds the "major functionality"
-- permission key so Super Admin can grant/restrict who may set a program's
-- negotiated rate, matching the table's existing RLS write policy
-- (finance + super_admin) as the default.

insert into permission_definitions (key, category, label, description, default_roles, sort_order) values
  ('finance.program_rates.manage', 'Finance', 'Set program commission rates', 'Set a program''s negotiated commission rate percentage or fixed amount, used to suggest partner-commission amounts.', array['finance', 'super_admin']::staff_role[], 45);
