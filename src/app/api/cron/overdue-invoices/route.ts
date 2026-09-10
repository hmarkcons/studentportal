import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { computeInvoiceStatus } from "@/lib/invoiceStatus";
import { sendOverdueReminderIfDue } from "@/lib/actions/consultancyFee";
import { checkCronRequest } from "@/lib/cronAuth";

// Daily Vercel Cron job (see vercel.json) — finds every invoice currently
// "overdue" (an installment past its due date and still unpaid) and sends a
// reminder email, throttled to once per 24h per invoice inside
// sendOverdueReminderIfDue.
export async function GET(request: NextRequest) {
  // This one emails students about money, so being publicly triggerable
  // mattered more than most. See cronAuth.
  const auth = checkCronRequest(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const admin = createAdminClient();

  const { data: invoices } = await admin.from("invoices").select("id, student_id, admin_fee_status");
  if (!invoices || invoices.length === 0) return NextResponse.json({ checked: 0, reminded: 0 });

  let reminded = 0;
  const results: { invoiceId: string; result: unknown }[] = [];

  for (const invoice of invoices) {
    const { data: installments } = await admin
      .from("invoice_installments")
      .select("status, due_date")
      .eq("invoice_id", invoice.id);

    const status = computeInvoiceStatus(installments ?? []);
    if (status !== "overdue") continue;

    const result = await sendOverdueReminderIfDue(invoice.id, invoice.student_id);
    results.push({ invoiceId: invoice.id, result });
    if (result && "success" in result) reminded++;
  }

  return NextResponse.json({ checked: invoices.length, reminded, results });
}
