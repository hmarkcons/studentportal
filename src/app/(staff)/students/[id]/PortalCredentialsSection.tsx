"use client";

import { useState } from "react";
import { CredentialField } from "@/components/CredentialField";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { SendCredentialsBar } from "./SendCredentialsBar";
import { SECTION_PRESETS, credentialLabel, inCredentialsSection } from "@/lib/studentCredentials";
import { suggestedPortalLink } from "@/lib/portalLink";

// visa_appointment_portal is shown to the student on their own Visa tab, so
// its name has to be the one that page looks for.
const PRESETS = SECTION_PRESETS.map((credentialType) => ({ label: credentialLabel(credentialType), credentialType }));

function slugify(label: string) {
  return label
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "");
}

export function PortalCredentialsSection({
  studentId,
  existingTypes,
  links = {},
  email,
}: {
  studentId: string;
  existingTypes: string[];
  /** Each saved login's page, by credential type. */
  links?: Record<string, string>;
  /** Where "Send to student" emails the logins ticked: the address on their record. */
  email: string | null;
}) {
  const [extra, setExtra] = useState<{ label: string; credentialType: string }[]>([]);
  const [newLabel, setNewLabel] = useState("");

  const shown = new Map<string, string>();
  PRESETS.forEach((p) => shown.set(p.credentialType, p.label));
  // Every login saved but this portal's own, which Registration & Portal
  // Access manages and sends — saving over its copy here changed the copy and
  // not the password.
  existingTypes.filter(inCredentialsSection).forEach((t) => {
    // Named as the email and the message name it, so staff see what the student will.
    if (!shown.has(t)) shown.set(t, credentialLabel(t));
  });
  extra.forEach((e) => shown.set(e.credentialType, e.label));

  return (
    <div className="flex flex-col gap-3">
      {/* Sends the logins below that are ticked — none to begin with. */}
      <SendCredentialsBar studentId={studentId} email={email} scope="section" />
      {Array.from(shown.entries()).map(([credentialType, label]) => (
        <CredentialField
          key={credentialType}
          label={label}
          ownerType="student"
          ownerId={studentId}
          credentialType={credentialType}
          revalidateTo={`/students/${studentId}`}
          link={links[credentialType] ?? null}
          suggestedLink={suggestedPortalLink(credentialType)}
        />
      ))}

      <div className="flex items-end gap-2 border-t border-border pt-3">
        <Input
          value={newLabel}
          onChange={(e) => setNewLabel(e.target.value)}
          placeholder="Portal name (e.g. Visa appointment portal)"
          className="flex-1"
        />
        <Button
          type="button"
          variant="outline-primary"
          size="sm"
          onClick={() => {
            const label = newLabel.trim();
            if (!label) return;
            const credentialType = slugify(label);
            if (!shown.has(credentialType)) setExtra((prev) => [...prev, { label, credentialType }]);
            setNewLabel("");
          }}
        >
          + Add credential
        </Button>
      </div>
    </div>
  );
}
