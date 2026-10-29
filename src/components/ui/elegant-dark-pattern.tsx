import type React from "react";

// Adapted from the 21st.dev "Elegant Dark Pattern" (DarkGradientBg): the unused
// `cn` import is dropped and the `className` prop is actually applied; the
// external CDN noise PNG is replaced with a self-contained inline SVG grain; and
// `bg-gradient-radial` (not a Tailwind v4 utility) becomes an inline radial
// gradient so the highlight renders. Pure CSS — no deps, no assets.

/** Tiny class joiner — the project has no `cn`/clsx util. */
function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}

// Self-contained film grain (replaces the external CDN texture).
const NOISE =
  "data:image/svg+xml;utf8," +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="140" height="140"><filter id="n"><feTurbulence type="fractalNoise" baseFrequency="0.8" numOctaves="2" stitchTiles="stitch"/></filter><rect width="100%" height="100%" filter="url(#n)"/></svg>',
  );

const STREAK_MASKS = [
  "linear-gradient(90deg, rgba(0,0,0,0) 0%, rgb(0,0,0) 20%, rgba(0,0,0,0) 36%, rgb(0,0,0) 55%, rgba(0,0,0,0.13) 67%, rgb(0,0,0) 78%, rgba(0,0,0,0) 97%)",
  "linear-gradient(90deg, rgba(0,0,0,0) 11%, rgb(0,0,0) 25%, rgba(0,0,0,0.55) 41%, rgba(0,0,0,0.13) 67%, rgb(0,0,0) 78%, rgba(0,0,0,0) 97%)",
  "linear-gradient(90deg, rgba(0,0,0,0) 9%, rgb(0,0,0) 20%, rgba(0,0,0,0.55) 28%, rgba(0,0,0,0.424) 40%, rgb(0,0,0) 48%, rgba(0,0,0,0.267) 54%, rgba(0,0,0,0.13) 78%, rgb(0,0,0) 88%, rgba(0,0,0,0) 97%)",
  "linear-gradient(90deg, rgba(0,0,0,0) 0%, rgb(0,0,0) 17%, rgba(0,0,0,0.55) 26%, rgb(0,0,0) 35%, rgba(0,0,0,0) 47%, rgba(0,0,0,0.13) 69%, rgb(0,0,0) 79%, rgba(0,0,0,0) 97%)",
  "linear-gradient(90deg, rgba(0,0,0,0) 0%, rgb(0,0,0) 20%, rgba(0,0,0,0.55) 27%, rgb(0,0,0) 42%, rgba(0,0,0,0) 48%, rgba(0,0,0,0.13) 67%, rgb(0,0,0) 74%, rgb(0,0,0) 82%, rgba(0,0,0,0.47) 88%, rgba(0,0,0,0) 97%)",
];

interface DarkGradientBgProps {
  children?: React.ReactNode;
  className?: string;
}

export function DarkGradientBg({ children, className }: DarkGradientBgProps) {
  return (
    <div className={cx("relative min-h-screen w-full overflow-hidden bg-black", className)}>
      <div className="absolute inset-0">
        <div
          className="absolute inset-0 opacity-100"
          style={{
            background: "radial-gradient(100% 100% at 0% 0%, rgb(46,46,46) 0%, rgb(0,0,0) 100%)",
            mask: "radial-gradient(125% 100% at 0% 0%, rgb(0,0,0) 0%, rgba(0,0,0,0.224) 88.2883%, rgba(0,0,0,0) 100%)",
            WebkitMask: "radial-gradient(125% 100% at 0% 0%, rgb(0,0,0) 0%, rgba(0,0,0,0.224) 88.2883%, rgba(0,0,0,0) 100%)",
          }}
        >
          {/* Skewed fading blue streaks */}
          {STREAK_MASKS.map((m, i) => (
            <div
              key={i}
              className="absolute inset-0 opacity-20"
              style={{
                background: "linear-gradient(rgb(0,207,255) 0%, rgba(0,207,255,0) 100%)",
                mask: m,
                WebkitMask: m,
                transform: "skewX(45deg)",
              }}
            />
          ))}
        </div>
      </div>

      {/* Film grain */}
      <div className="absolute inset-0 bg-repeat opacity-5" style={{ backgroundImage: `url("${NOISE}")`, backgroundSize: "150px" }} />

      {/* Subtle dot pattern overlay */}
      <div
        className="absolute inset-0 opacity-20"
        style={{ backgroundImage: "radial-gradient(circle at 1px 1px, rgba(255,255,255,0.5) 1px, transparent 0)", backgroundSize: "20px 20px" }}
      />

      {/* Subtle radial highlight */}
      <div className="absolute inset-0" style={{ background: "radial-gradient(ellipse at 50% 0%, rgba(30,41,59,0.2) 0%, transparent 70%)" }} />

      {/* Content */}
      <div className="relative z-10">{children}</div>
    </div>
  );
}

export default DarkGradientBg;
