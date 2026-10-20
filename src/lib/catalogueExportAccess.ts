import { getStaffSession } from "@/lib/auth/session";
import { getEffectivePermissions } from "@/lib/auth/permissions";
import { hasRole } from "@/lib/auth/roles";
import { canOpenPath } from "@/lib/pageAccess";

/**
 * Whether the person asking may download the universities sheet or the
 * catalogue: they must be able to open Setup › Universities, and hold
 * "Export universities & catalogue" (0338). Both, because a page switched off
 * for a role — as it is for counsellors here — must not be readable through
 * its download instead. A refusal says which is missing.
 */
export async function catalogueExportRefusal(): Promise<Response | null> {
  const { staff } = await getStaffSession();
  if (!staff) return new Response("Not authorized", { status: 403 });
  const perms = await getEffectivePermissions();
  const superAdmin = hasRole(staff, "super_admin");
  if (!canOpenPath("/setup/universities", perms, superAdmin)) {
    return new Response("Setup › Universities isn't open to your role — ask a Super Admin.", { status: 403 });
  }
  if (!superAdmin && perms["catalogue.export"] !== true) {
    return new Response("Exporting the catalogue isn't switched on for your role — ask a Super Admin.", { status: 403 });
  }
  return null;
}
