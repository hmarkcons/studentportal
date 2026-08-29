import { unstable_cache } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";

// Reference/lookup data that's identical for every staff member and rarely
// changes (edited only from the Setup pages), but was being re-queried from
// scratch on nearly every student-page navigation. Cached here and
// invalidated on demand via revalidateTag from the matching mutation
// actions — safe to serve from a service-role client because the result is
// not user-specific and every caller already passed a staff-auth check
// before reaching these.

export const getCachedDestinations = unstable_cache(
  async () => {
    const supabase = createAdminClient();
    const { data } = await supabase.from("destinations").select("id, display_name, installment_plan").order("display_name");
    return data ?? [];
  },
  ["destinations-list"],
  { tags: ["destinations"], revalidate: 300 }
);

export const getCachedActiveUniversities = unstable_cache(
  async () => {
    const supabase = createAdminClient();
    const { data } = await supabase
      .from("universities")
      .select("id, name, status, destination_id")
      .eq("status", "active")
      .order("name");
    return data ?? [];
  },
  ["universities-active-list"],
  { tags: ["universities"], revalidate: 300 }
);

export const getCachedFeeProducts = unstable_cache(
  async () => {
    const supabase = createAdminClient();
    const { data } = await supabase.from("fee_products").select("id, name, default_amount, default_currency").order("name");
    return data ?? [];
  },
  ["fee-products-list"],
  { tags: ["fee-products"], revalidate: 300 }
);

export const getCachedAgreementTemplates = unstable_cache(
  async () => {
    const supabase = createAdminClient();
    const { data } = await supabase.from("agreement_templates").select("id, name, signatory_name, destination:destinations(display_name)");
    return data ?? [];
  },
  ["agreement-templates-list"],
  { tags: ["agreement-templates"], revalidate: 300 }
);

export const getCachedCounselors = unstable_cache(
  async () => {
    const supabase = createAdminClient();
    const { data } = await supabase.from("staff").select("id, full_name").order("full_name");
    return data ?? [];
  },
  ["counselors-list"],
  { tags: ["staff-directory"], revalidate: 300 }
);
