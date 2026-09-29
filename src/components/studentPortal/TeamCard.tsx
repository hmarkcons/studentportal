import type { TeamPerson } from "@/lib/studentTeam";
import { Mail, Phone, UserRound } from "lucide-react";

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .slice(0, 2)
    .join("");
}

/**
 * One of the two people who look after a student, as the staff Dashboard shows
 * them: photo, name, designation, the office number and the office email —
 * each one tappable, because a student on a phone should not copy a number
 * out by hand.
 */
export function TeamCard({
  person,
  role,
  blurb,
  pending,
  marker,
}: {
  person: TeamPerson | null;
  role: string;
  /** What this person does for them, in a line. */
  blurb: string;
  /** Said in place of a person not assigned yet. */
  pending: string;
  marker: string;
}) {
  if (!person) {
    return (
      <div
        className="flex items-center gap-4 rounded-2xl border border-dashed border-border bg-card/60 p-5"
        data-team-member={marker}
        data-assigned="no"
      >
        <span aria-hidden className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl border border-dashed border-border text-muted">
          <UserRound className="h-7 w-7" strokeWidth={1.8} />
        </span>
        <span className="min-w-0">
          <span className="block text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">{role}</span>
          <span className="mt-0.5 block text-sm text-muted">{pending}</span>
        </span>
      </div>
    );
  }

  const tel = person.mobile_official ? `tel:${person.mobile_official.replace(/[^+\d]/g, "")}` : null;
  return (
    <div
      className="relative flex flex-col gap-4 overflow-hidden rounded-2xl border border-border bg-card p-5"
      data-lift
      data-team-member={marker}
      data-assigned="yes"
    >
      <span aria-hidden className="bg-hero absolute inset-x-0 top-0 h-1" />
      <div className="flex items-start gap-4">
        {person.photoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- a signed storage URL, sized here; next/image would proxy it through the server for no gain
          <img
            src={person.photoUrl}
            alt={person.full_name}
            width={64}
            height={64}
            loading="lazy"
            decoding="async"
            className="h-16 w-16 shrink-0 rounded-2xl object-cover ring-4 ring-primary/10"
            data-team-photo
          />
        ) : (
          <span aria-hidden className="bg-hero flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl text-xl font-semibold text-white shadow-md shadow-primary/25">
            {initials(person.full_name)}
          </span>
        )}
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-primary">{role}</p>
          <p className="text-base font-semibold text-ink">{person.full_name}</p>
          {person.designation && <p className="text-xs text-muted">{person.designation}</p>}
          <p className="mt-1.5 text-xs text-muted">{blurb}</p>
        </div>
      </div>

      {(person.mobile_official || person.email_official) && (
        <dl className="flex flex-col gap-1.5 rounded-xl bg-bg/70 px-3.5 py-3 text-sm">
          {person.mobile_official && (
            <div className="min-w-0">
              <dt className="sr-only">Office phone</dt>
              <dd className="flex min-w-0 items-center gap-2.5">
                <Phone aria-hidden className="h-4 w-4 shrink-0 text-primary" />
                <a href={tel!} className="truncate font-medium text-ink hover:text-primary">
                  {person.mobile_official}
                </a>
              </dd>
            </div>
          )}
          {person.email_official && (
            <div className="min-w-0">
              <dt className="sr-only">Office email</dt>
              <dd className="flex min-w-0 items-center gap-2.5">
                <Mail aria-hidden className="h-4 w-4 shrink-0 text-primary" />
                <a href={`mailto:${person.email_official}`} className="truncate font-medium text-ink hover:text-primary">
                  {person.email_official}
                </a>
              </dd>
            </div>
          )}
        </dl>
      )}

      <div className="flex flex-wrap gap-2">
        {tel && (
          <a href={tel} className="bg-hero inline-flex w-fit items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold text-white shadow-sm shadow-primary/25 hover:opacity-95">
            <Phone aria-hidden className="h-3.5 w-3.5 shrink-0" />
            Call
          </a>
        )}
        {person.email_official && (
          <a
            href={`mailto:${person.email_official}`}
            className="inline-flex w-fit items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-medium text-ink hover:border-primary hover:text-primary"
          >
            <Mail aria-hidden className="h-3.5 w-3.5 shrink-0" />
            Email
          </a>
        )}
      </div>
    </div>
  );
}
