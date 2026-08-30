import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/Card";
import { TicketThread, type TicketReplyRow } from "@/components/TicketThread";
import { TicketStatusSelect } from "./TicketStatusSelect";

function one<T>(v: T | T[] | null) {
  return Array.isArray(v) ? v[0] ?? null : v;
}

export default async function TicketDetailPage(props: PageProps<"/support/[id]">) {
  const { id } = await props.params;
  const supabase = await createClient();

  const { data: ticket } = await supabase
    .from("support_tickets")
    .select("id, subject, body, status, created_at, student_id, student:leads(full_name)")
    .eq("id", id)
    .maybeSingle();
  if (!ticket) notFound();

  const student = one(ticket.student as never) as { full_name?: string } | null;

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
    author_name: r.author_type === "staff" ? (staffNames.get(r.author_id) ?? "Staff") : (student?.full_name ?? "Student"),
    body: r.body,
    created_at: r.created_at,
  }));

  const revalidateTo = `/support/${id}`;

  return (
    <div className="w-full max-w-2xl">
      <Link href="/support" className="text-sm text-muted hover:text-ink">
        &larr; Back to support tickets
      </Link>

      <Card className="mt-2 mb-4">
        <div className="mb-2 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-ink">{ticket.subject}</h2>
            <p className="text-xs text-muted">
              {student?.full_name ?? "Unknown student"} · {new Date(ticket.created_at).toLocaleString()}
            </p>
          </div>
          <TicketStatusSelect ticketId={ticket.id} status={ticket.status} revalidateTo={revalidateTo} />
        </div>
        <p className="whitespace-pre-wrap text-sm text-ink">{ticket.body}</p>
      </Card>

      <Card>
        <h3 className="mb-3 text-sm font-medium text-ink">Conversation</h3>
        <TicketThread ticketId={ticket.id} authorType="staff" replies={replies} revalidateTo={revalidateTo} />
      </Card>
    </div>
  );
}
