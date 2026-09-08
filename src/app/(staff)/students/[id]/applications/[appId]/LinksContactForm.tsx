"use client";

import { useState } from "react";
import { useActionState } from "react";
import { updateApplicationLinks } from "@/lib/actions/applications";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";

type Props = {
  applicationId: string;
  studentId: string;
  programId: string | null;
  universityId: string | null;
  pageLink: string | null;
  requirementsLink: string | null;
  applicationPortalLink: string | null;
  contactEmail: string | null;
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
        <p>University email: {contactEmail ?? <span className="text-muted">—</span>}</p>
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
            <Input name="page_link" type="url" inputMode="url" defaultValue={pageLink ?? ""} placeholder="https://…" />
          </label>
          <label className="flex flex-col gap-1 text-xs text-muted">
            Requirements link
            <Input name="requirements_link" type="url" inputMode="url" defaultValue={requirementsLink ?? ""} placeholder="https://…" />
          </label>
          <label className="col-span-full flex flex-col gap-1 text-xs text-muted">
            Application portal link
            <Input
              name="application_portal_link"
              type="url"
              inputMode="url"
              defaultValue={applicationPortalLink ?? ""}
              placeholder="https://…"
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
        University email
        <Input name="contact_email" type="email" defaultValue={contactEmail ?? ""} placeholder="admissions@university.edu" />
      </label>
      {state?.error && <p className="text-xs text-danger">{state.error}</p>}
      {/* Confirmed in place rather than closing the form on success: the only
          lint-clean way to auto-close would be to reset state after the action,
          and a stale success flag would then shut the form the next time Modify
          was clicked. Closing shows the corrected links, revalidated. */}
      {state?.success && <p className="text-xs text-success">Saved.</p>}
      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" variant="primary" size="sm" pending={pending}>
          Save
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={() => setEditing(false)}>
          {state?.success ? "Close" : "Cancel"}
        </Button>
      </div>
    </form>
  );
}

function LinkRow({ label, href, cta }: { label: string; href: string | null; cta: string }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span>{label}:</span>
      {href ? (
        <a
          href={href}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center justify-center gap-1.5 rounded-md border border-primary px-2 py-1 text-xs font-medium text-primary transition-colors hover:bg-primary/10"
        >
          👁️ {cta}
        </a>
      ) : (
        <span className="text-muted">—</span>
      )}
    </div>
  );
}
