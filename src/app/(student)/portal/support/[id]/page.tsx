import Link from "next/link";
import { ArrowLeft, MessagesSquare, Ticket } from "lucide-react";
import { notFound } from "next/navigation";
import { getStudentUser } from "@/lib/auth/session";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { TicketThread, type TicketReplyRow } from "@/components/TicketThread";
import { MarkTicketRead } from "@/components/MarkTicketRead";
import { formatStamp } from "@/lib/activityStamp";
import { PortalPageHeader } from "@/components/studentPortal/PortalPageHeader";

function one<T>(v: T | T[] | null) {
  return Array.isArray(v) ? v[0] ?? null : v;
}

const STATUS_TONE: Record<string, "success" | "info" | "warning"> = {
  resolved: "success",
  in_progress: "info",
  open: "warning",
};

export default async function PortalTicketDetailPage(props: PageProps<"/portal/support/[id]">) {
  const { id } = await props.params;
  const { supabase, userId } = await getStudentUser();

  const { data: ticket, error } = await supabase
    .from("support_tickets")
    .select("id, subject, body, status, created_at, student:leads!inner(auth_user_id, full_name)")
    .eq("id", id)
    .maybeSingle();

  const student = ticket ? (one(ticket.student as never) as { auth_user_id?: string; full_name?: string } | null) : null;
  if (error || !ticket || student?.auth_user_id !== userId) notFound();

  const { data: rawReplies } = await supabase
    .from("support_ticket_replies")
    .select("id, author_type, body, created_at")
    .eq("ticket_id", id)
    .order("created_at", { ascending: true });

  // Staff replies are attributed to the desk, not to an individual. A student
  // cannot read the staff table under RLS, so the lookup that used to sit here
  // always came back empty and fell through to this same label — a query on
  // every page load that could only ever fail. Naming the desk is also the
  // better answer: a ticket is answered by HMARK, not by whoever picked it up.
  const replies: TicketReplyRow[] = (rawReplies ?? []).map((r) => ({
    id: r.id,
    author_type: r.author_type,
    author_name: r.author_type === "staff" ? "HMARK Support" : "You",
    body: r.body,
    created_at: r.created_at,
  }));

  const revalidateTo = `/portal/support/${id}`;

  return (
    <div className="flex w-full flex-col gap-6" data-portal-page>
      <Link
        href="/portal/support"
        data-rise
        className="inline-flex w-fit items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1 text-sm text-muted shadow-sm hover:border-primary hover:text-primary"
      >
        <ArrowLeft aria-hidden className="h-4 w-4 shrink-0" />
        Back to support
      </Link>

      {/* Opening the ticket is what clears its "new reply" flag. */}
      <MarkTicketRead ticketId={ticket.id} side="student" />

      <PortalPageHeader
        icon={Ticket}
        eyebrow="Support ticket"
        title={ticket.subject}
        // created_at was selected here and never shown.
        description={`Raised ${formatStamp(ticket.created_at)}`}
        aside={<Badge tone={STATUS_TONE[ticket.status] ?? "warning"}>{ticket.status.replace("_", " ")}</Badge>}
      >
        <p className="whitespace-pre-wrap rounded-xl bg-bg/70 px-4 py-3 text-sm text-ink">{ticket.body}</p>
      </PortalPageHeader>

      <Card>
        <h3 className="mb-3 flex items-center gap-2 text-base font-semibold text-ink">
          <MessagesSquare aria-hidden className="h-5 w-5 text-primary shrink-0" /> Conversation
        </h3>
        <TicketThread ticketId={ticket.id} authorType="student" replies={replies} revalidateTo={revalidateTo} />
      </Card>
    </div>
  );
}
