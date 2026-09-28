// The student portal's skeleton, in the shape its pages now take — a header
// panel, a row of figures, then cards — so the page settles into place rather
// than jumping from a plain grey list to something else entirely.
export default function Loading() {
  return (
    <div className="flex w-full flex-col gap-6" aria-busy="true" aria-label="Loading">
      <div className="rounded-2xl border border-border bg-card p-6">
        <div className="flex items-center gap-4">
          <div className="h-12 w-12 animate-pulse rounded-2xl bg-primary/20" />
          <div className="flex flex-1 flex-col gap-2">
            <div className="h-5 w-48 animate-pulse rounded bg-border/70" />
            <div className="h-3 w-2/3 max-w-md animate-pulse rounded bg-border/50" />
          </div>
        </div>
        <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-16 animate-pulse rounded-xl bg-border/40" />
          ))}
        </div>
      </div>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {[0, 1].map((i) => (
          <div key={i} className="rounded-2xl border border-border bg-card p-6">
            <div className="mb-4 h-4 w-32 animate-pulse rounded bg-border/60" />
            <div className="flex flex-col gap-3">
              <div className="h-3 w-full animate-pulse rounded bg-border/40" />
              <div className="h-3 w-5/6 animate-pulse rounded bg-border/40" />
              <div className="h-3 w-2/3 animate-pulse rounded bg-border/40" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
