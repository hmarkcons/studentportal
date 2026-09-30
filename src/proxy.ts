import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { evaluateAgreementGate, isGateAllowedPath } from "@/lib/portalGate";
import { accessVerdict, clientIp, isAccessAllowedPath, type AccessState } from "@/lib/officeAccess";
import { SESSION_ONLY_COOKIE, sessionOnlyCookieOptions } from "@/lib/sessionCookies";

/** Whose token this is, read without checking it: see gateRead in proxy(). */
function tokenSubject(accessToken: string): string | null {
  try {
    const part = accessToken.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    const payload = JSON.parse(atob(part.padEnd(Math.ceil(part.length / 4) * 4, "=")));
    return typeof payload.sub === "string" ? payload.sub : null;
  } catch {
    return null;
  }
}

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
  // Someone who left "Keep me signed in" unticked: the tokens refreshed here
  // stay session cookies, so closing the browser still signs them out.
  const sessionOnly = Boolean(request.cookies.get(SESSION_ONLY_COOKIE));

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
            response.cookies.set(name, value, sessionOnly ? sessionOnlyCookieOptions(options) : options)
          );
        },
      },
    }
  );

  // Staff signing in from outside the office network get a waiting screen and
  // nothing else until somebody approves them (0202). Checked here because
  // this is the only place every request passes through: fewer than half the
  // server actions call requirePermission, so a per-action gate would leak.
  //
  // One round trip, and only for a signed-in user on a page that is gated at
  // all. staff_access_state answers allowed=true for students, partners,
  // anyone on the office network, any Super Admin, and — while no office
  // network has been configured — everybody, so this costs an unconfigured
  // installation one cheap query and changes nothing.
  //
  // Not for a page opened on the student or partner portal: the answer there
  // is always yes, since the check restricts staff alone, and those layouts
  // turn away anyone who is not a student or a partner — so the round trip
  // bought nothing on every one of their page loads. A POST still pays it: a
  // server action is found by its id, not its page, and one shared with the
  // staff side must not become a way round the office check.
  const studentOrPartnerPage = request.method === "GET" && /^\/(portal|partner)(\/|$)/.test(request.nextUrl.pathname);
  const needsAccessCheck = !studentOrPartnerPage && !isAccessAllowedPath(request.nextUrl.pathname);
  const readAccess = () => Promise.resolve(supabase.rpc("staff_access_state", { p_ip: clientIp(request.headers) }));

  // The agreement gate, further down, for a student portal page.
  const portalGated = request.nextUrl.pathname.startsWith("/portal") && !isGateAllowedPath(request.nextUrl.pathname);
  const readGate = (userId: string) =>
    Promise.resolve(
      // The student and their agreements in one round trip, not two.
      supabase
        .from("leads")
        .select("id, agreements(status, signing_method, signed_file_path, video_recording_path, approval_undone_at)")
        .eq("auth_user_id", userId)
        .maybeSingle()
    );

  // Both asked at the same time as getUser below rather than after it, when
  // that is safe. What is never safe is two calls refreshing the session at
  // once: a refresh token is spent by using it, so the second would sign the
  // person out. getSession reads the cookie and refreshes only a token within
  // 90 seconds of expiring. So with minutes left on it, nothing refreshes and
  // all of them can go at once; nearer expiry, getUser refreshes it first and
  // the others follow, as they always did.
  //
  // The gate needs the student's id before getUser has vouched for it, so it
  // is taken from the token unchecked. That is only which row to ask for: the
  // database checks the token itself and returns nothing that is not theirs,
  // and the answer is used only once getUser has named the same person.
  let accessRead: ReturnType<typeof readAccess> | null = null;
  let gateRead: { userId: string; read: ReturnType<typeof readGate> } | null = null;
  if (needsAccessCheck || portalGated) {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (session?.expires_at && session.expires_at * 1000 - Date.now() > 5 * 60_000) {
      if (needsAccessCheck) accessRead = readAccess();
      const subject = portalGated ? tokenSubject(session.access_token) : null;
      if (subject) gateRead = { userId: subject, read: readGate(subject) };
    }
  }

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

  // The office check, described above.
  if (user && needsAccessCheck) {
    const { data: accessState } = await (accessRead ?? readAccess());
    const verdict = accessVerdict((accessState as AccessState | null) ?? null, request.nextUrl.pathname);
    if (!verdict.allow) {
      const url = request.nextUrl.clone();
      url.pathname = verdict.redirectTo;
      url.search = "";
      return NextResponse.redirect(url);
    }
  }

  // Hold an e-signature student on the agreement page until they have attached
  // the signed document and the consent video. Enforced here rather than in
  // the layout because a layout cannot see the pathname, and redirecting from
  // one that also wraps /portal/agreement would loop.
  if (user && portalGated) {
    const { data: lead } = await (gateRead?.userId === user.id ? gateRead.read : readGate(user.id));
    if (lead) {
      const agreements = (lead.agreements ?? []) as Parameters<typeof evaluateAgreementGate>[0];
      if (evaluateAgreementGate(agreements).locked) {
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
  // Everything this runs on costs at least one auth round trip, and a second
  // for the office-access check. So anything that cannot be gated is excluded
  // here rather than waved through inside the function, which would still have
  // paid to start it.
  //
  // Beyond the build output and images, that means the files browsers and
  // crawlers fetch alongside a page — the font files, the source maps a
  // devtools window asks for, robots/sitemap/manifest — none of which carry a
  // session or reveal anything.
  matcher: [
    "/((?!_next/static|_next/image|favicon\\.ico|robots\\.txt|sitemap\\.xml|manifest\\.webmanifest|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|avif|woff|woff2|ttf|otf|eot|map|txt|xml)$).*)",
  ],
};
