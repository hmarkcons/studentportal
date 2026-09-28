export function Card({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  // data-card lets a portal give every card its own finish in one place (the
  // student portal's, in globals.css) without each page asking for it.
  return (
    <div data-card className={`rounded-lg border border-border bg-card p-6 ${className}`}>
      {children}
    </div>
  );
}
