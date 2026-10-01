export function Card({
  children,
  className = "",
  id,
}: {
  children: React.ReactNode;
  className?: string;
  /** An address on the page to link to (#id). */
  id?: string;
}) {
  // data-card lets a portal give every card its own finish in one place (the
  // student portal's, in globals.css) without each page asking for it.
  return (
    <div id={id} data-card className={`rounded-lg border border-border bg-card p-6 ${className}`}>
      {children}
    </div>
  );
}
