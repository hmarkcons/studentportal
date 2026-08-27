"use client";

import { useState } from "react";
import { CredentialField } from "@/components/CredentialField";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";

const PRESETS = [
  { label: "Gmail", credentialType: "gmail" },
  { label: "University portal", credentialType: "university_portal" },
];

function slugify(label: string) {
  return label
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "");
}

export function PortalCredentialsSection({ studentId, existingTypes }: { studentId: string; existingTypes: string[] }) {
  const [extra, setExtra] = useState<{ label: string; credentialType: string }[]>([]);
  const [newLabel, setNewLabel] = useState("");

  const shown = new Map<string, string>();
  PRESETS.forEach((p) => shown.set(p.credentialType, p.label));
  existingTypes.forEach((t) => {
    if (!shown.has(t)) shown.set(t, t.replace(/_/g, " "));
  });
  extra.forEach((e) => shown.set(e.credentialType, e.label));

  return (
    <div className="flex flex-col gap-3">
      {Array.from(shown.entries()).map(([credentialType, label]) => (
        <CredentialField
          key={credentialType}
          label={label}
          ownerType="student"
          ownerId={studentId}
          credentialType={credentialType}
          revalidateTo={`/students/${studentId}`}
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
