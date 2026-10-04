"use client";

import { useActionState, useState } from "react";
import { registerLead } from "@/lib/actions/leads";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { RegistrationPersonalFields } from "@/components/RegistrationPersonalFields";
import type { RegistrationPersonal } from "@/lib/registrationPersonal";
import { toast } from "@/lib/toast";

/**
 * "Register this lead": a short form, not one click, because a student is
 * registered with their date of birth, address and emergency contact — all
 * required (src/lib/registrationPersonal.ts). Whatever is already on file is
 * filled in.
 *
 * Registering moves straight to the new student's Profile tab, taking this
 * form with it, so success is a toast; a refusal is said in the form.
 */
export function RegisterLeadButton({
  leadId,
  leadName,
  defaults,
}: {
  leadId: string;
  leadName: string;
  defaults: Partial<Record<keyof RegistrationPersonal, string | null | undefined>>;
}) {
  const [open, setOpen] = useState(false);
  const register = async (prevState: unknown, formData: FormData) => {
    try {
      return await registerLead(leadId, prevState, formData);
    } catch (error) {
      // A redirect is how it answers success.
      const digest = (error as { digest?: unknown })?.digest;
      if (typeof digest === "string" && digest.startsWith("NEXT_REDIRECT")) toast("Lead registered.");
      throw error;
    }
  };
  const [state, formAction, pending] = useActionState(register, undefined);

  return (
    <>
      <Button type="button" variant="primary" onClick={() => setOpen(true)} data-register-lead>
        Register this lead
      </Button>
      {open && (
        <Modal open={open} onClose={() => setOpen(false)} title={`Register ${leadName}`}>
          {/* Kept as typed when the server refuses it: React clears a form after its action. */}
          <form action={formAction} onReset={(e) => e.preventDefault()} className="flex flex-col gap-4" data-register-lead-form>
            <p className="text-sm text-muted">
              A student is registered with their date of birth, address and someone to call in an emergency. All are
              required; anything already on file is filled in.
            </p>
            <RegistrationPersonalFields
              defaults={Object.fromEntries(Object.entries(defaults).map(([k, v]) => [k, v ?? ""]))}
            />
            {state?.error && <p className="text-sm text-danger">{state.error}</p>}
            <div className="flex items-center gap-2">
              <Button type="submit" variant="primary" pending={pending}>
                Register
              </Button>
              <button type="button" onClick={() => setOpen(false)} className="text-sm text-muted hover:underline">
                Cancel
              </button>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}
