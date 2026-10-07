import Link from "next/link";
import { History } from "lucide-react";

/** For a Super Admin: everything that happened to this record, in the audit log — with the way back. */
export function AuditHistoryLink({ tab, id }: { tab: "students" | "leads" | "staff" | "universities"; id: string }) {
  return (
    <Link
      prefetch={false}
      href={`/admin/audit-log?tab=${tab}&s=${id}`}
      data-audit-history
      className="inline-flex items-center gap-1 text-xs text-muted hover:text-ink"
    >
      <History aria-hidden className="h-3.5 w-3.5" />
      History
    </Link>
  );
}
