export function PageSkeleton() {
  return (
    <div className="flex flex-col gap-6">
      <div className="h-6 w-48 animate-pulse rounded bg-border/60" />
      {[0, 1, 2].map((i) => (
        <div key={i} className="rounded-lg border border-border bg-card p-6">
          <div className="mb-4 h-4 w-32 animate-pulse rounded bg-border/60" />
          <div className="flex flex-col gap-3">
            <div className="h-3 w-full animate-pulse rounded bg-border/40" />
            <div className="h-3 w-5/6 animate-pulse rounded bg-border/40" />
            <div className="h-3 w-2/3 animate-pulse rounded bg-border/40" />
          </div>
        </div>
      ))}
    </div>
  );
}
