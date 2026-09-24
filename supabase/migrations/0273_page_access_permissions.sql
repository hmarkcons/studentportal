-- A permission for opening each staff page, so the menu shows only what a
-- role is allowed and a hidden page cannot be opened by typing its address.
--
-- Until now every menu item was shown to every active staff member, and most
-- pages had no rule about who may open them — only about who may change
-- things on them. So Role Permissions had nothing to say "this role does not
-- use Payroll". Each menu item now has a "page.*" permission, in its own
-- category on that screen, with defaults set per job (approved by the office
-- on 2026-09-24). A Super Admin holds every one, as staff_has_permission()
-- always has.
--
-- The keys must match src/lib/pageAccess.ts, which is what the menu and the
-- page guards read. Pages governed by an existing permission (Staff
-- Management, Leave, Role Permissions) and everyone's own pages (Dashboard,
-- My leave, My agreement) are deliberately not here.
--
-- Additive, and safe to re-run: an existing key is left as it is, so a
-- default already changed on the Role Permissions screen is never reset.

do $$
begin
  if to_regclass('public.permission_definitions') is null then
    raise exception '0273: public.permission_definitions is missing (0094)';
  end if;
end $$;

insert into public.permission_definitions (key, category, label, description, default_roles, sort_order) values
  -- Main
  ('page.leads', 'Menu & page access', 'Open Leads', 'See Leads in the menu and open it.', array['management', 'counselor', 'marketing', 'digital_marketing']::staff_role[], 101),
  ('page.students', 'Menu & page access', 'Open Students', 'See Students in the menu and open student records.', array['management', 'counselor', 'processing', 'finance']::staff_role[], 102),
  ('page.applications', 'Menu & page access', 'Open Applications', 'See Applications in the menu and open it.', array['management', 'counselor', 'processing']::staff_role[], 103),
  ('page.calendar', 'Menu & page access', 'Open Calendar', 'See Calendar in the menu and open it.', array['management', 'counselor', 'processing', 'finance', 'marketing', 'digital_marketing']::staff_role[], 104),
  ('page.support', 'Menu & page access', 'Open Support Tickets', 'See Support Tickets in the menu and open them.', array['management', 'counselor', 'processing']::staff_role[], 105),
  ('page.inventory', 'Menu & page access', 'Open Inventory', 'See Inventory in the menu and open it.', array['management', 'counselor', 'processing', 'finance', 'marketing', 'digital_marketing']::staff_role[], 106),

  -- Setup
  ('page.setup.destinations', 'Menu & page access', 'Open Setup → Destinations', 'See Destinations under Setup and open it.', array['management', 'counselor', 'processing']::staff_role[], 110),
  ('page.setup.universities', 'Menu & page access', 'Open Setup → Universities', 'See Universities under Setup and open it.', array['management', 'counselor', 'processing']::staff_role[], 111),
  ('page.setup.scholarship_bodies', 'Menu & page access', 'Open Setup → Scholarship bodies', 'See Scholarship bodies under Setup and open it.', array['management', 'counselor', 'processing']::staff_role[], 112),
  ('page.setup.agreement_templates', 'Menu & page access', 'Open Setup → Agreement templates', 'See Agreement templates under Setup and open it.', array['management', 'processing']::staff_role[], 113),
  ('page.setup.agreement_generator', 'Menu & page access', 'Open Setup → Agreement generator', 'See Agreement generator under Setup and open it.', array['management', 'processing']::staff_role[], 114),
  ('page.setup.document_trackers', 'Menu & page access', 'Open Setup → Document trackers', 'See Document trackers under Setup and open it.', array['management', 'processing']::staff_role[], 115),
  ('page.setup.create_doc_checklist', 'Menu & page access', 'Open Setup → Create Doc Checklist', 'See Create Doc Checklist under Setup and open it.', array['management', 'processing']::staff_role[], 116),
  ('page.setup.invoice_settings', 'Menu & page access', 'Open Setup → Invoice settings', 'See Invoice settings under Setup and open it.', array['finance']::staff_role[], 117),
  ('page.setup.attendance_policy', 'Menu & page access', 'Open Setup → Attendance policy', 'See Attendance policy under Setup and open it.', array['management']::staff_role[], 118),
  ('page.setup.office_network', 'Menu & page access', 'Open Setup → Office network', 'See Office network under Setup and open it.', array[]::staff_role[], 119),
  ('page.setup.visa_page_builder', 'Menu & page access', 'Open Setup → Visa page builder', 'See Visa page builder under Setup and open it.', array['processing']::staff_role[], 120),
  ('page.setup.visa_offices', 'Menu & page access', 'Open Setup → Visa offices', 'See Visa offices under Setup and open it.', array['processing']::staff_role[], 121),
  ('page.setup.visa_messages', 'Menu & page access', 'Open Setup → Visa messages', 'See Visa messages under Setup and open it.', array['processing']::staff_role[], 122),
  ('page.setup.reengagement_messages', 'Menu & page access', 'Open Setup → Re-engagement messages', 'See Re-engagement messages under Setup and open it.', array['management', 'counselor']::staff_role[], 123),
  ('page.setup.travel_guide', 'Menu & page access', 'Open Setup → Travel & arrival guides', 'See Travel & arrival guides under Setup and open it.', array['processing']::staff_role[], 124),
  ('page.setup.support_faqs', 'Menu & page access', 'Open Setup → Support FAQ', 'See Support FAQ under Setup and open it.', array['management']::staff_role[], 125),
  ('page.setup.guide_videos', 'Menu & page access', 'Open Setup → Guide tutorials', 'See Guide tutorials under Setup and open it.', array['management']::staff_role[], 126),

  -- Accounts & Finance
  ('page.finance.invoice_generator', 'Menu & page access', 'Open Finance → Invoice Generator', 'See Invoice Generator under Accounts & Finance and open it.', array['finance']::staff_role[], 130),
  ('page.finance.staff_commission', 'Menu & page access', 'Open Finance → Staff Commission', 'See Staff Commission under Accounts & Finance and open it.', array['finance']::staff_role[], 131),
  ('page.finance.refunds', 'Menu & page access', 'Open Finance → Refunds', 'See Refunds under Accounts & Finance and open it.', array['management', 'finance']::staff_role[], 132),
  ('page.finance.consultancy_fee', 'Menu & page access', 'Open Finance → Consultancy Fee', 'See Consultancy Fee under Accounts & Finance and open it.', array['finance']::staff_role[], 133),
  ('page.finance.payroll', 'Menu & page access', 'Open Finance → Payroll', 'See Payroll under Accounts & Finance and open it.', array['finance']::staff_role[], 134),
  ('page.finance.partner_commissions', 'Menu & page access', 'Open Finance → University Commissions', 'See University Commissions under Accounts & Finance and open it.', array['management', 'finance']::staff_role[], 135),
  ('page.marketing.referrals', 'Menu & page access', 'Open Finance → Referrals', 'See Referrals under Accounts & Finance and open it.', array['finance', 'marketing', 'digital_marketing']::staff_role[], 136),

  -- Marketing
  ('page.marketing.campaigns', 'Menu & page access', 'Open Marketing → Campaigns', 'See Campaigns under Marketing and open it.', array['management', 'marketing', 'digital_marketing']::staff_role[], 140),
  ('page.marketing.social_calendar', 'Menu & page access', 'Open Marketing → Social calendar', 'See Social calendar under Marketing and open it.', array['management', 'marketing', 'digital_marketing']::staff_role[], 141),
  ('page.marketing.ad_campaigns', 'Menu & page access', 'Open Marketing → Ad campaigns', 'See Ad campaigns under Marketing and open it.', array['management', 'marketing', 'digital_marketing']::staff_role[], 142),
  ('page.marketing.broadcast', 'Menu & page access', 'Open Marketing → Broadcast message', 'See Broadcast message under Marketing and open it.', array['management']::staff_role[], 143),

  -- Reports, HR, Admin
  ('page.reports', 'Menu & page access', 'Open Reports', 'See Reports in the menu and open them.', array['management', 'finance', 'marketing']::staff_role[], 150),
  ('page.admin.attendance', 'Menu & page access', 'Open HR → Attendance', 'See Attendance under HR and open it (where staff clock in and out).', array['management', 'counselor', 'processing', 'finance', 'marketing', 'digital_marketing']::staff_role[], 160),
  ('page.admin.message_templates', 'Menu & page access', 'Open HR → Message templates', 'See Message templates under HR and open it.', array['management', 'counselor', 'processing']::staff_role[], 161),
  ('page.admin.additional_services', 'Menu & page access', 'Open Admin → Additional services', 'See Additional services under Admin and open it.', array['processing']::staff_role[], 170),
  ('page.admin.audit_log', 'Menu & page access', 'Open Admin → Audit log', 'See the Audit log under Admin and open it.', array[]::staff_role[], 171)
on conflict (key) do nothing;
