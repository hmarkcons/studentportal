import { addressIn, emailParts } from "@/lib/catalogueText";

/**
 * An email field as written (0304): one address, several, or words. Each
 * part that is an address is a mail link of its own; anything else — "see
 * the faculty page", "Prof. Bianchi" — is shown as text, never linked.
 */
export function EmailLinks({ value, className = "text-primary hover:underline" }: { value: string | null | undefined; className?: string }) {
  const parts = emailParts(value);
  if (parts.length === 0) return null;
  return (
    <>
      {parts.map((part, i) => {
        const address = addressIn(part);
        return (
          <span key={i}>
            {i > 0 && ", "}
            {address ? (
              <a href={`mailto:${address}`} className={className}>
                {part}
              </a>
            ) : (
              part
            )}
          </span>
        );
      })}
    </>
  );
}
