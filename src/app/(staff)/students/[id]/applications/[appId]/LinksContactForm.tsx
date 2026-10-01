"use client";

import { useState } from "react";
import { Eye } from "lucide-react";
import { useActionState } from "react";
import { updateApplicationLinks } from "@/lib/actions/applications";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { EmailLinks } from "@/components/EmailLinks";
import { EMAILS_MAX, linkHref } from "@/lib/catalogueText";

type Props = {
  applicationId: string;
  studentId: string;
  programId: string | null;
  universityId: string | null;
  pageLink: string | null;
  requirementsLink: string | null;
  applicationPortalLink: string | null;
  contactEmail: string | null;
  /** The programme's coordinator, beside the university's general address (0287). */
  coordinatorEmail: string | null;
};

// Read-only by default with a Modify button, rather than a permanently open
// form: this section is read far more often than it is corrected, and the
// buttons are what staff actually come here to click.
export function LinksContactForm({
  applicationId,
  studentId,
  programId,
  universityId,
  pageLink,
  requirementsLink,
  applicationPortalLink,
  contactEmail,
  coordinatorEmail,
}: Props) {
  const [editing, setEditing] = useState(false);
  const action = updateApplicationLinks.bind(null, applicationId, studentId, programId, universityId);
  const [state, formAction, pending] = useActionState(action, undefined);

  if (!editing) {
    return (
      <div className="flex flex-col gap-3 text-sm text-ink">
        <LinkRow label="Course page" href={pageLink} cta="View course page" />
        <LinkRow label="Requirements" href={requirementsLink} cta="View requirements" />
        <LinkRow label="Application portal" href={applicationPortalLink} cta="View application portal" />
        <p>University email: {contactEmail ? <EmailLinks value={contactEmail} /> : <span className="text-muted">—</span>}</p>
        <p data-coordinator-email>
          Programme coordinator:{" "}
          {coordinatorEmail ? <EmailLinks value={coordinatorEmail} /> : <span className="text-muted">—</span>}
        </p>
        <div>
          <Button type="button" variant="outline" size="sm" onClick={() => setEditing(true)}>
            Modify
          </Button>
        </div>
      </div>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <p className="text-xs text-muted">
        These belong to the program and the university, so a correction here shows for every student applying to them —
        which is usually the point, but worth knowing.
      </p>
      {programId ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-1 text-xs text-muted">
            Course page link
            <Input name="page_link" inputMode="url" defaultValue={pageLink ?? ""} placeholder="https://… or a note" />
          </label>
          <label className="flex flex-col gap-1 text-xs text-muted">
            Requirements link
            <Input name="requirements_link" inputMode="url" defaultValue={requirementsLink ?? ""} placeholder="https://… or a note" />
          </label>
          <label className="flex flex-col gap-1 text-xs text-muted">
            Programme coordinator email(s)
            <Input
              name="coordinator_email"
              maxLength={EMAILS_MAX}
              defaultValue={coordinatorEmail ?? ""}
              placeholder="a@university.edu, b@university.edu"
            />
          </label>
          <label className="col-span-full flex flex-col gap-1 text-xs text-muted">
            Application portal link
            <Input
              name="application_portal_link"
              inputMode="url"
              defaultValue={applicationPortalLink ?? ""}
              placeholder="https://… or a note"
            />
          </label>
        </div>
      ) : (
        <p className="text-xs text-muted">
          No program is selected on this application, so there is nowhere to keep the course, requirements and portal
          links yet. Pick a program first and they become editable here.
        </p>
      )}
      <label className="flex flex-col gap-1 text-xs text-muted sm:max-w-sm">
        University email(s)
        <Input name="contact_email" maxLength={EMAILS_MAX} defaultValue={contactEmail ?? ""} placeholder="admissions@university.edu, …" />
      </label>
      {state?.error && <p className="text-xs text-danger">{state.error}</p>}
      <div className="flex flex-wrap items-center gap-2">
        {/* Confirmed in place, beside Save, rather than closing the form on
            success: the only lint-clean way to auto-close would be to reset
            state after the action, and a stale success flag would then shut the
            form the next time Modify was clicked. Closing shows the corrected
            links, revalidated. */}
        <Button type="submit" variant="primary" size="sm" pending={pending} status={{ state, label: "Saved." }}>
          Save
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={() => setEditing(false)}>
          {state?.success ? "Close" : "Cancel"}
        </Button>
      </div>
    </form>
  );
}

/**
 * A link field as written (0304): a button when it is a real web address,
 * the words themselves when it is not — never an href made of whatever was
 * typed.
 */
function LinkRow({ label, href: value, cta }: { label: string; href: string | null; cta: string }) {
  const href = linkHref(value);
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span>{label}:</span>
      {value && !href ? (
        <span className="break-words">{value}</span>
      ) : href ? (
        <a
          href={href}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center justify-center gap-1.5 rounded-md border border-primary px-2 py-1 text-xs font-medium text-primary transition-colors hover:bg-primary/10"
        >
          <Eye aria-hidden className="h-3.5 w-3.5 shrink-0" />
          {cta}
        </a>
      ) : (
        <span className="text-muted">—</span>
      )}
    </div>
  );
}
