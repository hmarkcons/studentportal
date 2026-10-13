import Link from "next/link";
import { KeyRound, MessageCircle, ShieldCheck } from "lucide-react";
import { getStudentUser } from "@/lib/auth/session";
import { Card } from "@/components/ui/Card";
import { PortalPageHeader } from "@/components/studentPortal/PortalPageHeader";
import { PortalEmpty } from "@/components/studentPortal/PortalEmpty";
import { LoginDetails } from "@/components/LoginDetails";
import { FocusFromHash } from "@/components/FocusFromHash";
import { ACCENT_CLASSES, LOGIN_KIND_ICON } from "@/components/studentPortal/loginKinds";
import { groupLogins, loadMyLogins, loginAnchor, loginHeading } from "@/lib/studentLogins";

/**
 * Every login HMARK keeps for the student, on one page (0333): the Dashboard
 * shows the first two and comes here for the rest.
 *
 * Grouped by the kind of account — their email, the universities, the visa,
 * the scholarships, anything else — each in the colour of its section in the
 * menu, with a chip at the top to jump to each. Shown as they are, with no
 * Reveal, read-only: only HMARK changes them. A login picked on the Dashboard
 * arrives here by its address (#login-…) and lights up.
 */
export default async function PortalLoginsPage() {
  const { supabase } = await getStudentUser();
  const logins = await loadMyLogins(supabase);
  const groups = groupLogins(logins);

  return (
    <div className="flex w-full flex-col gap-6" data-portal-page data-logins-page>
      <FocusFromHash />
      <PortalPageHeader
        icon={KeyRound}
        eyebrow="Your accounts"
        title="Your logins"
        description="Every account HMARK keeps for you, ready to use: copy the username and the password, then open the login page."
        aside={
          logins.length > 0 ? (
            <span className="rounded-full border border-border bg-card px-3 py-1 text-xs text-muted" data-logins-count>
              {logins.length} login{logins.length === 1 ? "" : "s"}
            </span>
          ) : undefined
        }
      >
        {groups.length > 1 && (
          <nav aria-label="Jump to a kind of login" className="flex flex-wrap gap-2" data-login-jumps>
            {groups.map((g) => {
              const Icon = LOGIN_KIND_ICON[g.kind];
              return (
                <a
                  key={g.kind}
                  href={`#group-${g.kind}`}
                  className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold transition-colors ${ACCENT_CLASSES[g.accent].chip}`}
                >
                  <Icon aria-hidden className="h-3.5 w-3.5 shrink-0" />
                  {g.title}
                  <span className="rounded-full bg-card/80 px-1.5 text-[10px] font-bold">{g.logins.length}</span>
                </a>
              );
            })}
          </nav>
        )}
      </PortalPageHeader>

      {groups.length === 0 ? (
        <Card>
          <PortalEmpty
            icon={KeyRound}
            title="No logins yet"
            action={
              <Link
                prefetch={false}
                href="/portal/messages"
                className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-medium text-ink hover:border-primary hover:text-primary"
              >
                <MessageCircle aria-hidden className="h-3.5 w-3.5 shrink-0" />
                Message your counsellor
              </Link>
            }
          >
            When HMARK opens an account for you — your Gmail, a university portal, the visa appointment portal — its login appears here.
          </PortalEmpty>
        </Card>
      ) : (
        groups.map((g) => {
          const Icon = LOGIN_KIND_ICON[g.kind];
          return (
            <section key={g.kind} id={`group-${g.kind}`} className="flex scroll-mt-24 flex-col gap-3" data-rise data-login-group={g.kind}>
              <div className="flex items-center gap-3">
                <span aria-hidden className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${ACCENT_CLASSES[g.accent].soft}`}>
                  <Icon className="h-5 w-5" />
                </span>
                <div className="min-w-0">
                  <h3 className="text-base font-semibold text-ink">
                    {g.title} <span className="font-normal text-muted">· {g.logins.length}</span>
                  </h3>
                  <p className="text-xs text-muted">{g.blurb}</p>
                </div>
              </div>
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                {g.logins.map((l) => (
                  <LoginDetails
                    key={`${l.ownerId}:${l.credentialType}`}
                    id={loginAnchor(l)}
                    kind={l.kind}
                    label={loginHeading(l).title}
                    caption={loginHeading(l).caption}
                    credentialType={l.credentialType}
                    username={l.username}
                    password={l.password}
                    link={l.link}
                    updatedAt={l.updatedAt}
                  />
                ))}
              </div>
            </section>
          );
        })
      )}

      {groups.length > 0 && (
        <Card>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between" data-logins-safety>
            <div className="flex items-start gap-3">
              <span aria-hidden className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <ShieldCheck className="h-5 w-5" />
              </span>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-ink">Keep them to yourself</p>
                <ul className="mt-1 flex list-disc flex-col gap-0.5 pl-4 text-xs text-muted">
                  <li>Don&apos;t share these, and don&apos;t send anyone a picture of this page.</li>
                  <li>If one stops working, message your counsellor rather than trying again — some portals lock an account after a few wrong attempts.</li>
                  <li>HMARK keeps them up to date: when one is changed, it changes here.</li>
                </ul>
              </div>
            </div>
            <Link
              prefetch={false}
              href="/portal/messages"
              className="inline-flex w-fit shrink-0 items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-ink shadow-sm hover:opacity-90"
            >
              <MessageCircle aria-hidden className="h-3.5 w-3.5 shrink-0" />
              Message your counsellor
            </Link>
          </div>
        </Card>
      )}
    </div>
  );
}
