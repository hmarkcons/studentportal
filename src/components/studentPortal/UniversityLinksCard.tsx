import { ExternalLink, Link2, Mail } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { EmailLinks } from "@/components/EmailLinks";
import { LoginDetails } from "@/components/LoginDetails";
import { linkHref } from "@/lib/catalogueText";
import type { MyLogin } from "@/lib/studentLogins";

/**
 * An application's Links & contact, as the student reads it: the programme's
 * pages and the university's addresses — the ones staff keep on the
 * application — and the university portal login kept against it, shown as it
 * is. Read-only; a link field may hold words (0304), which are shown as words.
 */
export function UniversityLinksCard({
  universityName,
  pageLink,
  requirementsLink,
  applicationPortalLink,
  contactEmail,
  coordinatorEmail,
  logins,
}: {
  universityName: string;
  pageLink: string | null;
  requirementsLink: string | null;
  applicationPortalLink: string | null;
  contactEmail: string | null;
  coordinatorEmail: string | null;
  logins: MyLogin[];
}) {
  const links = [
    { label: "Course page", value: pageLink, cta: "View course page" },
    { label: "Requirements", value: requirementsLink, cta: "View requirements" },
    { label: "Application portal", value: applicationPortalLink, cta: "Open application portal" },
  ].filter((l) => l.value?.trim());
  const emails = [
    { label: "University email", value: contactEmail },
    { label: "Programme coordinator", value: coordinatorEmail },
  ].filter((e) => e.value?.trim());

  return (
    // Card takes no data attributes, so the marker is on a wrapper.
    <div data-links-contact>
    <Card>
      <h3 className="mb-1 flex items-center gap-2 text-base font-semibold text-ink">
        <Link2 aria-hidden className="h-5 w-5 shrink-0 text-primary" /> Links &amp; contact
      </h3>
      <p className="mb-4 text-xs text-muted">
        {universityName}&apos;s own pages for this programme, and its contacts. Your HMARK team submits the application — if anything here needs doing, ask them
        first.
      </p>
      <div className={`grid grid-cols-1 gap-5 ${logins.length > 0 ? "lg:grid-cols-2" : ""}`}>
        <div className="flex flex-col gap-3 text-sm text-ink">
          {links.length === 0 && emails.length === 0 && <p className="text-muted">No links or contacts are recorded for this programme yet.</p>}
          {links.map((l) => {
            const href = linkHref(l.value);
            return (
              <div key={l.label} className="flex flex-wrap items-center gap-2" data-link-row={l.label}>
                <span className="w-36 shrink-0 text-xs font-medium text-muted">{l.label}</span>
                {href ? (
                  <a
                    href={href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 rounded-md border border-primary px-2.5 py-1 text-xs font-medium text-primary transition-colors hover:bg-primary/10"
                  >
                    {l.cta}
                    <ExternalLink aria-hidden className="h-3.5 w-3.5 shrink-0" />
                  </a>
                ) : (
                  <span className="min-w-0 break-words">{l.value}</span>
                )}
              </div>
            );
          })}
          {emails.map((e) => (
            <div key={e.label} className="flex flex-wrap items-center gap-2" data-email-row={e.label}>
              <span className="w-36 shrink-0 text-xs font-medium text-muted">{e.label}</span>
              <span className="inline-flex min-w-0 items-center gap-1.5 break-all">
                <Mail aria-hidden className="h-3.5 w-3.5 shrink-0 text-muted" />
                <span className="min-w-0">
                  <EmailLinks value={e.value} />
                </span>
              </span>
            </div>
          ))}
        </div>
        {logins.length > 0 && (
          <div className="flex flex-col gap-3">
            {logins.map((l) => (
              <LoginDetails
                key={l.credentialType}
                label={l.credentialType === "university_portal" ? "Your university portal login" : l.label}
                credentialType={l.credentialType}
                username={l.username}
                password={l.password}
                link={l.link}
              />
            ))}
          </div>
        )}
      </div>
    </Card>
    </div>
  );
}
