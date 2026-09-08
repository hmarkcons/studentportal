import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { buildAndStoreInvoicePdf } from "@/lib/actions/invoices";

// Public receipt view, opened from the "View receipt" button in an invoice
// email. Students may not have a portal login, so access is by an unguessable
// token with an expiry rather than a session — see migration 0118. The URL
// never contains the invoice id, and issuing a new token invalidates the
// previous link.
//
// Served inline so the browser's own PDF viewer opens it in the new tab, from
// where it can be printed or saved. No auth cookie is involved, so the
// response must never be cached by a shared cache.
export async function GET(_request: NextRequest, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;

  // Reject anything that isn't a uuid before touching the database, so this
  // endpoint can't be used to probe with arbitrary strings.
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(token)) {
    return gone("This receipt link isn't valid.");
  }

  const admin = createAdminClient();

  const { data: invoice } = await admin
    .from("invoices")
    .select("id, student_id, pdf_path, invoice_number, receipt_token_expires_at")
    .eq("receipt_token", token)
    .maybeSingle();

  if (!invoice) return gone("This receipt link isn't valid. Ask HMARK Consultants to send it again.");

  if (invoice.receipt_token_expires_at && new Date(invoice.receipt_token_expires_at) < new Date()) {
    return gone("This receipt link has expired. Ask HMARK Consultants to send you a fresh one.");
  }

  // Build on first view when the PDF has not been generated yet, so a link is
  // never dead just because nobody pressed "Build PDF" beforehand.
  let path = invoice.pdf_path;
  if (!path) {
    const built = await buildAndStoreInvoicePdf(admin, invoice.id, invoice.student_id);
    if (built?.error) return gone("This receipt could not be prepared. Please contact HMARK Consultants.");
    const { data: refreshed } = await admin.from("invoices").select("pdf_path").eq("id", invoice.id).maybeSingle();
    path = refreshed?.pdf_path ?? null;
  }
  if (!path) return gone("This receipt could not be prepared. Please contact HMARK Consultants.");

  const { data: file, error } = await admin.storage.from("documents").download(path);
  if (error || !file) return gone("This receipt could not be opened. Please contact HMARK Consultants.");

  // The invoice number IS the file name — HMC-<intake>-<counter>, minted per
  // intake by next_invoice_number. No prefix of our own on top of it: the
  // number is the reference staff and students quote to each other, and
  // "HMARK-Invoice-HMC-Fall 2026-101.pdf" says the same thing three times.
  const filename = `${invoice.invoice_number ?? `HMC-${invoice.id.slice(0, 8)}`}.pdf`;
  return new NextResponse(await file.arrayBuffer(), {
    headers: {
      "Content-Type": "application/pdf",
      // inline = open in the tab's PDF viewer; the filename is used if the
      // viewer's save button is pressed.
      "Content-Disposition": `inline; filename="${filename}"`,
      "Cache-Control": "private, no-store",
      "X-Robots-Tag": "noindex, nofollow",
    },
  });
}

/** A plain, readable page rather than a bare 404 — this is opened by students. */
function gone(message: string) {
  const html = `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Receipt unavailable</title>
<style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#f7f7f9;
font:16px/1.5 system-ui,-apple-system,Segoe UI,Roboto,sans-serif;color:#1c1b22;padding:24px}
.c{max-width:26rem;background:#fff;border:1px solid #e5e3ea;border-radius:12px;padding:28px;text-align:center}
h1{margin:0 0 8px;font-size:1.05rem}p{margin:0;color:#6b6a76;font-size:.95rem}</style>
<div class="c"><h1>Receipt unavailable</h1><p>${message}</p></div>`;
  return new NextResponse(html, {
    status: 404,
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", "X-Robots-Tag": "noindex, nofollow" },
  });
}
