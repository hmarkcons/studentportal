import { unstable_cache } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { readAll } from "@/lib/catalogueReads";
import { DEFAULT_LOGIN_FIGURES, isLoginFigureIcon, type LoginFigure } from "@/lib/loginFigures";

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
    const { data } = await supabase
      .from("destinations")
      // intake_mode/intake_seasons shape the intake field on every form that
      // sets one — Italy has a single intake a year, Germany two, the UK is
      // written out — so they travel with the destination list (0170).
      .select(
        "id, display_name, status, installment_plan, admin_charge, consultancy_fee, consultancy_fee_currency, intake_mode, intake_seasons"
      )
      .order("display_name");
    return data ?? [];
  },
  ["destinations-list"],
  { tags: ["destinations"], revalidate: 300 }
);

/**
 * The destinations a NEW record may be pointed at — paused ones removed.
 *
 * This list is deliberately NOT filtered at source: several callers use it as
 * a lookup table (a student's own destination, an agreement template's
 * country), and dropping a paused destination from those would blank out
 * details for students already registered for it. So the filtering belongs at
 * the pickers, which is what this is for.
 *
 * `keepIds` is how an editing form keeps a destination a student already has,
 * even once it is paused: without it, re-saving their registration would
 * silently drop the country they are actually going to.
 *
 * Note the test is "is it explicitly inactive", not "is it active". This list
 * is cached for five minutes and Vercel's Data Cache survives deployments, so
 * for a few minutes after a release an entry can come back from cache without
 * the `status` field at all. Treating unknown as usable keeps the dropdown
 * populated; treating it as paused would empty every destination picker in the
 * portal until the cache turned over.
 */
export function selectableDestinations<T extends { id: string; status?: string | null }>(
  all: T[],
  keepIds: (string | null | undefined)[] = []
): T[] {
  const keep = new Set(keepIds.filter((k): k is string => Boolean(k)));
  return all.filter((d) => d.status !== "inactive" || keep.has(d.id));
}

export const getCachedActiveUniversities = unstable_cache(
  async () => {
    const supabase = createAdminClient();
    // Paged: a single read stops at 1000 rows without saying so, and the
    // catalogue is past 300 and growing.
    return readAll<{ id: string; name: string; status: string; destination_id: string }>((from, to) =>
      supabase.from("universities").select("id, name, status, destination_id").eq("status", "active").order("name").order("id").range(from, to)
    );
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
    const { data } = await supabase.from("agreement_templates").select("id, name, signatory_name, service_type, destination:destinations(id, display_name)");
    return data ?? [];
  },
  ["agreement-templates-list-v2"],
  { tags: ["agreement-templates"], revalidate: 300 }
);

export const getCachedCounselors = unstable_cache(
  async () => {
    const supabase = createAdminClient();
    const { data } = await supabase
      .from("staff")
      .select("id, full_name")
      .contains("roles", ["counselor"])
      .eq("status", "active")
      .order("full_name");
    return data ?? [];
  },
  ["counselors-list"],
  { tags: ["staff-directory"], revalidate: 300 }
);

/**
 * The figures on the login screen (0278), in order.
 *
 * The login page is the busiest page there is and is public, so it reads
 * these from the cache rather than the database on every visit; Setup →
 * Login screen clears the "login-figures" tag when they change. Falls back to
 * the office's figures if the table cannot be read — the login page must
 * never fail for want of a statistic.
 */
export const getCachedLoginFigures = unstable_cache(
  async (): Promise<LoginFigure[]> => {
    const supabase = createAdminClient();
    const { data, error } = await supabase.from("login_figures").select("value, label, icon").order("sort_order");
    if (error || !data?.length) return DEFAULT_LOGIN_FIGURES;
    return data.map((r) => ({ value: r.value, label: r.label, icon: isLoginFigureIcon(r.icon) ? r.icon : "star" }));
  },
  ["login-figures"],
  { tags: ["login-figures"], revalidate: 86400 }
);
