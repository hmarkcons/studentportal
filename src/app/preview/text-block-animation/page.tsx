import TextBlockAnimation from "@/components/ui/text-block-animation";
import { ArrowDown } from "lucide-react";

/**
 * Standalone preview of the Text Block Animation — a GSAP SplitText + colored
 * block reveal, with a scroll-triggered section below. Outside the portal route
 * groups so it renders full-screen under the root layout.
 */
export const metadata = { title: "Text Block Animation — Preview" };

export default function TextBlockAnimationPreview() {
  return (
    <div className="flex min-h-screen w-full flex-col bg-bg text-ink">
      {/* Hero — plays on load */}
      <section className="relative flex min-h-screen flex-col items-center justify-center px-6">
        <div className="w-full max-w-4xl">
          <TextBlockAnimation blockColor="#6366f1" animateOnScroll={false} delay={0.2} duration={0.8}>
            <h1 className="text-5xl font-black leading-tight tracking-tighter md:text-7xl lg:text-8xl">
              Don&apos;t just inform.
              <br />
              <span className="mt-2 inline-block rounded-md bg-primary px-3 pb-1 text-primary-ink">Captivate.</span>
            </h1>
          </TextBlockAnimation>
        </div>

        <div className="absolute bottom-12 flex flex-col items-center gap-2 opacity-60">
          <span className="text-xs uppercase tracking-widest text-muted">Scroll to reveal</span>
          <ArrowDown className="h-5 w-5 animate-bounce text-muted" />
        </div>
      </section>

      {/* Pitch — plays on scroll */}
      <section className="flex min-h-[80vh] flex-col items-center justify-center px-6 py-24">
        <div className="w-full max-w-3xl space-y-16">
          <TextBlockAnimation blockColor="#10b981" duration={0.7}>
            <h2 className="text-3xl font-bold md:text-4xl lg:text-5xl">Motion that earns attention.</h2>
          </TextBlockAnimation>

          <TextBlockAnimation blockColor="#f59e0b" stagger={0.03}>
            <p className="text-lg leading-relaxed text-muted md:text-2xl">
              You stopped scrolling because the motion caught your eye. That&apos;s GSAP and React properly combined —
              bespoke animation that makes an interface feel alive.
            </p>
          </TextBlockAnimation>

          <div className="border-l-2 border-primary pl-6">
            <TextBlockAnimation blockColor="#ffffff" duration={0.6}>
              <p className="text-base italic text-muted md:text-lg">
                &quot;If you want your pages to feel alive, this is how.&quot;
              </p>
            </TextBlockAnimation>
          </div>
        </div>
      </section>

      {/* Footer — plays on scroll */}
      <footer className="flex h-[40vh] items-center justify-center border-t border-border md:h-[50vh]">
        <TextBlockAnimation blockColor="#ef4444" duration={0.8}>
          <span className="text-4xl font-black transition-colors hover:text-primary md:text-6xl lg:text-7xl">
            Let&apos;s build it.
          </span>
        </TextBlockAnimation>
      </footer>
    </div>
  );
}
