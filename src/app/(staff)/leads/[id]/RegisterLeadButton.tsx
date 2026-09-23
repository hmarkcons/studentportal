"use client";

import { registerLead } from "@/lib/actions/leads";
import { Button } from "@/components/ui/Button";
import { useButtonAction } from "@/components/useButtonAction";

/**
 * Registering moves straight to the new student's Profile tab, taking this
 * button with it, so the confirmation is a toast. A failure — the action
 * throws rather than returning an error — is said beside the button, which
 * is still there.
 */
export function RegisterLeadButton({ leadId }: { leadId: string }) {
  const register = useButtonAction();
  return (
    <Button
      type="button"
      variant="primary"
      pending={register.pending}
      onClick={() => register.run(() => registerLead(leadId, new FormData()), { toast: "Lead registered." })}
      status={{ state: register.state, label: "Registered.", showError: true }}
    >
      Register this lead
    </Button>
  );
}
