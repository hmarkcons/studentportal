import { hasRole } from "@/lib/auth/roles";
import type { StaffQueue } from "@/lib/staffQueue";
import type { WaitingKind } from "@/lib/waitingItems";

/**
 * The part of the staff queue that is this person's job.
 *
 * The queue is read through the viewer's own session, so row-level security
 * already limits it to rows they can see — but seeing a row is not the same
 * as owning the work. A counsellor can read their registered students'
 * documents, and was being told "3 documents to review" that are
 * processing's to review. Each kind now shows only for the roles that do it.
 */
export function scopeQueue(queue: StaffQueue, staff: Parameters<typeof hasRole>[0]): StaffQueue {
  const processingWork = hasRole(staff, "processing", "management", "super_admin");
  const studentContact = hasRole(staff, "counselor", "processing", "management", "super_admin");
  const money = hasRole(staff, "finance", "management", "super_admin");
  const running = hasRole(staff, "management", "super_admin");
  const allowed: Record<WaitingKind, boolean> = {
    deadline: processingWork,
    agreement: processingWork,
    task: processingWork,
    document: processingWork,
    ticket: studentContact,
    message: studentContact,
    instalment: money,
    inventory: running,
    // A lead's follow-up is its counsellor's; Management and Super Admin see the office's.
    followup: hasRole(staff, "counselor", "management", "super_admin"),
    // Asked for only when this person approves leave, and their own agreement is always theirs.
    leave: true,
    myagreement: true,
  };
  return { ...queue, items: queue.items.filter((i) => allowed[i.kind]) };
}
