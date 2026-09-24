import { hasRole } from "@/lib/auth/roles";
import type { StaffQueue } from "@/lib/staffQueue";

/**
 * The part of the staff queue that is this person's job.
 *
 * The queue is counted through the viewer's own session, so row-level
 * security already limits it to rows they can see — but seeing a row is not
 * the same as owning the work. A counsellor can read their registered
 * students' documents, and was being told "3 documents to review" that are
 * processing's to review. Each item now shows only for the roles that do it.
 */
export function scopeQueue(queue: StaffQueue, staff: Parameters<typeof hasRole>[0]): StaffQueue {
  const processingWork = hasRole(staff, "processing", "management", "super_admin");
  const studentContact = hasRole(staff, "counselor", "processing", "management", "super_admin");
  const money = hasRole(staff, "finance", "management", "super_admin");
  const running = hasRole(staff, "management", "super_admin");
  return {
    ...queue,
    upcomingDeadlines: processingWork ? queue.upcomingDeadlines : [],
    agreementsToVerify: processingWork ? queue.agreementsToVerify : [],
    overdueTasks: processingWork ? queue.overdueTasks : 0,
    documentsToReview: processingWork ? queue.documentsToReview : 0,
    ticketsWaiting: studentContact ? queue.ticketsWaiting : 0,
    unreadFrom: studentContact ? queue.unreadFrom : [],
    overdueInstalments: money ? queue.overdueInstalments : 0,
    inventoryRequestsPending: running ? queue.inventoryRequestsPending : 0,
  };
}
