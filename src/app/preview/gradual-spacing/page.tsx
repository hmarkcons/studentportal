import { GradualSpacing } from "@/components/ui/gradual-spacing";

/**
 * Standalone preview of Gradual Spacing — each character slides and fades in
 * with a staggered delay. Outside the portal route groups.
 */
export const metadata = { title: "Gradual Spacing — Preview" };

export default function GradualSpacingPreview() {
  return (
    <main className="flex min-h-screen w-full items-center justify-center bg-bg px-6">
      <GradualSpacing
        className="text-center text-4xl font-bold -tracking-widest text-ink md:text-7xl md:leading-[5rem]"
        text="Gradual Spacing"
      />
    </main>
  );
}
