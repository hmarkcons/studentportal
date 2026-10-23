import PerspectiveTunnelHero from "@/components/ui/perspective-tunnel-hero";

/**
 * Standalone, full-screen preview of the Perspective Tunnel hero.
 *
 * Deliberately outside the portal route groups, so it renders under the root
 * layout alone — no sidebar, no shell — and the component's 100svh height,
 * w-screen width and wheel-to-fly interaction all behave as designed.
 */
export const metadata = { title: "Perspective Tunnel — Preview" };

export default function PerspectiveTunnelPreview() {
  return <PerspectiveTunnelHero />;
}
