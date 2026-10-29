import { DarkGradientBg } from "@/components/ui/elegant-dark-pattern";

/**
 * Standalone preview of the Elegant Dark Pattern (DarkGradientBg) — a dark
 * radial gradient with skewed blue streaks, a dot grid and film grain, as a
 * backdrop for its children. Outside the portal route groups.
 */
export const metadata = { title: "Elegant Dark Pattern — Preview" };

export default function ElegantDarkPatternPreview() {
  return (
    <DarkGradientBg>
      <div className="flex min-h-screen items-center justify-center">
        <div className="space-y-6 p-8 text-center">
          <h1 className="text-4xl font-bold text-white">Dark Gradient Background</h1>
          <p className="mx-auto max-w-md text-lg text-gray-300">
            A clean, dark gradient background with subtle patterns and textures.
          </p>
        </div>
      </div>
    </DarkGradientBg>
  );
}
