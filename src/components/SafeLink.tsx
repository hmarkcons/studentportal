import { linkHref } from "@/lib/catalogueText";

/**
 * A link field as written (0304) — which takes anything, so whether it is
 * clickable is decided here and nowhere else: an http or https address (a
 * bare "www.unipv.it" gets https:// in front) is a link opening in a new tab;
 * anything else — words, a "javascript:" value — is plain text.
 *
 * `children` replaces the shown text, for a link with a call to action
 * ("View course page"); words are always shown as they are.
 */
export function SafeLink({
  value,
  children,
  className = "text-primary hover:underline",
}: {
  value: string | null | undefined;
  children?: React.ReactNode;
  className?: string;
}) {
  const text = (value ?? "").trim();
  if (!text) return null;
  const href = linkHref(text);
  if (!href) return <span className="break-words">{text}</span>;
  return (
    <a href={href} target="_blank" rel="noreferrer" className={`break-all ${className}`}>
      {children ?? text}
    </a>
  );
}
