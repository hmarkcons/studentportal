import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { evaluateAgreementGate, isGateAllowedPath } from "@/lib/portalGate";

export async function proxy(request: NextRequest) {
  // Cron endpoints authenticate themselves with the CRON_SECRET bearer token
  // rather than a session cookie. Without this they fall into the redirect
  // below and Vercel Cron only ever reaches /login, so the jobs never run.
  if (request.nextUrl.pathname.startsWith("/api/cron/")) {
    return NextResponse.next({ request });
  }

  // Emailed receipt links carry their own unguessable, expiring token and are
  // opened by students who may have no portal login at all. Without this they
  // are bounced to /login and the button in the email does nothing.
  if (request.nextUrl.pathname.startsWith("/receipt/")) {
    return NextResponse.next({ request });
  }

  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const isPublicPage =
    request.nextUrl.pathname.startsWith("/login") ||
    request.nextUrl.pathname.startsWith("/register/partner");

  if (!user && !isPublicPage) {
    const next = request.nextUrl.pathname + request.nextUrl.search;
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    url.searchParams.set("next", next);
    return NextResponse.redirect(url);
  }

  if (user && request.nextUrl.pathname.startsWith("/login")) {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    return NextResponse.redirect(url);
  }

  // Hold an e-signature student on the agreement page until they have attached
  // the signed document and the consent video. Enforced here rather than in
  // the layout because a layout cannot see the pathname, and redirecting from
  // one that also wraps /portal/agreement would loop.
  if (user && request.nextUrl.pathname.startsWith("/portal") && !isGateAllowedPath(request.nextUrl.pathname)) {
    const { data: lead } = await supabase.from("leads").select("id").eq("auth_user_id", user.id).maybeSingle();
    if (lead) {
      const { data: agreements } = await supabase
        .from("agreements")
        .select("status, signing_method, signed_file_path, video_recording_path, approval_undone_at")
        .eq("student_id", lead.id);
      if (evaluateAgreementGate(agreements ?? []).locked) {
        const url = request.nextUrl.clone();
        url.pathname = "/portal/agreement";
        url.search = "";
        return NextResponse.redirect(url);
      }
    }
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
