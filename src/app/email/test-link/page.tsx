import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Test email link — HMARK Consultants",
  robots: { index: false, follow: false },
};

const WHAT: Record<string, string> = {
  unsubscribe: "unsubscribe link",
  preferences: "email preferences link",
  "web-version": "“view in browser” link",
};

// Where a link in a TEST email goes: the unsubscribe, preferences and web
// version links are made for each recipient only when a campaign is sent, so
// in a test they come here and say so. Public — the test may be opened by
// anyone it was sent to.
export default async function TestLinkPage(props: { searchParams: Promise<{ link?: string }> }) {
  const { link } = await props.searchParams;
  const what = WHAT[link ?? ""] ?? "link";
  return (
    <main className="flex min-h-screen items-center justify-center bg-bg px-4">
      <div className="max-w-md rounded-lg border border-border bg-card p-6 text-center">
        <h1 className="mb-2 text-lg font-semibold text-ink">This was a test email</h1>
        <p className="text-sm text-muted">
          The {what} works in the real campaign, where each recipient gets their own. In a test email it opens this page
          instead.
        </p>
      </div>
    </main>
  );
}
