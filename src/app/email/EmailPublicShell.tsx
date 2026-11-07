// The frame of the pages a recipient reaches from an email: no portal chrome,
// just HMARK's name and the matter in hand.
export function EmailPublicShell({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <main className="flex min-h-screen items-start justify-center bg-bg px-4 py-12 sm:items-center">
      <div className="w-full max-w-lg rounded-lg border border-border bg-card p-6 shadow-sm">
        <p className="mb-1 text-xs font-medium uppercase tracking-wide text-primary">HMARK Consultants</p>
        <h1 className="mb-3 text-lg font-semibold text-ink">{title}</h1>
        {children}
      </div>
    </main>
  );
}
