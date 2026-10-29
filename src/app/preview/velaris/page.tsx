import Velaris from "@/components/ui/velaris";

/**
 * Standalone preview of Velaris — a WebGL simplex-noise animated gradient with
 * colour blending, vignette glow and film grain. Outside the portal route
 * groups so it fills the viewport under the root layout.
 */
export const metadata = { title: "Velaris — Preview" };

// Brand-tinted greens (keeps the default palette's spirit, nudged to #52be96).
const COLORS = ["#86efac", "#52be96", "#059669", "#000000"];

export default function VelarisPreview() {
  return (
    <Velaris colors={COLORS} height="100vh">
      <div className="flex h-full w-full flex-col items-center justify-center gap-4 px-6 text-center">
        <span className="rounded-full border border-white/20 bg-white/10 px-4 py-1 text-xs font-medium text-white/80 backdrop-blur">
          Powered by WebGL
        </span>
        <h1 className="max-w-2xl text-4xl font-semibold tracking-tight text-white sm:text-6xl">Living gradients in motion</h1>
        <p className="max-w-md text-sm text-white/70 sm:text-base">
          An animated simplex-noise background with colour blending, vignette glow and film grain.
        </p>
      </div>
    </Velaris>
  );
}
