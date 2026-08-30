import Link from "next/link";
import { notFound } from "next/navigation";
import { getStudentUser } from "@/lib/auth/session";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { TicketThread, type TicketReplyRow } from "@/components/TicketThread";

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
    .select("id, author_type, author_id, body, created_at")
    .eq("ticket_id", id)
    .order("created_at", { ascending: true });

  const staffIds = (rawReplies ?? []).filter((r) => r.author_type === "staff").map((r) => r.author_id);
  const staffNames = new Map<string, string>();
  if (staffIds.length > 0) {
    const { data: staffRows } = await supabase.from("staff").select("id, full_name").in("id", staffIds);
    (staffRows ?? []).forEach((s) => staffNames.set(s.id, s.full_name));
  }

  const replies: TicketReplyRow[] = (rawReplies ?? []).map((r) => ({
    id: r.id,
    author_type: r.author_type,
    author_name: r.author_type === "staff" ? (staffNames.get(r.author_id) ?? "HMARK Support") : "You",
    body: r.body,
    created_at: r.created_at,
  }));

  const revalidateTo = `/portal/support/${id}`;

  return (
    <div className="mx-auto max-w-2xl">
      <Link href="/portal/support" className="text-sm text-muted hover:text-ink">
        &larr; Back to support
      </Link>

      <Card className="mt-2 mb-4">
        <div className="mb-2 flex items-start justify-between gap-3">
          <h2 className="text-lg font-semibold text-ink">{ticket.subject}</h2>
          <Badge tone={STATUS_TONE[ticket.status] ?? "warning"}>{ticket.status.replace("_", " ")}</Badge>
        </div>
        <p className="whitespace-pre-wrap text-sm text-ink">{ticket.body}</p>
      </Card>

      <Card>
        <h3 className="mb-3 text-sm font-medium text-ink">Conversation</h3>
        <TicketThread ticketId={ticket.id} authorType="student" replies={replies} revalidateTo={revalidateTo} />
      </Card>
    </div>
  );
}
