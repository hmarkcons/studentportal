import { AuroraBackground } from "@/components/ui/aurora-background";

/**
 * Standalone, full-screen preview of the Aurora Background.
 *
 * Deliberately outside the portal route groups, so it renders under the root
 * layout alone — no sidebar, no shell — and the component's full-viewport
 * height and animated backdrop behave as designed. Matches the
 * perspective-tunnel preview pattern.
 */
export const metadata = { title: "Aurora Background — Preview" };

export default function AuroraBackgroundPreview() {
  return (
    <AuroraBackground>
      <div className="relative z-10 flex flex-col items-center gap-5 px-6 text-center">
        <h1 className="text-3xl font-semibold tracking-tight md:text-5xl">Aurora Background</h1>
        <p className="max-w-xl text-base opacity-80 md:text-lg">
          An animated, layered aurora gradient — a drop-in backdrop for heroes and splash screens.
        </p>
        <button
          type="button"
          className="rounded-full bg-slate-900 px-6 py-2.5 text-sm font-medium text-white transition hover:opacity-90 dark:bg-white dark:text-slate-900"
        >
          Get started
        </button>
      </div>
    </AuroraBackground>
  );
}
