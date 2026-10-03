/**
 * The HMARK Consultants logo, on no background of its own.
 *
 * Two versions of one transparent image: grey lettering for a light surface
 * (public/hmark-logo.png) and light lettering for a dark one
 * (public/hmark-logo-dark.png) — grey on a dark sidebar is barely there. Which
 * one shows is decided in CSS from the theme (globals.css, [data-brand-logo]),
 * so it follows the theme toggle with no script and no flash:
 *
 *   sidebar   dark in the dark and semi-dark themes;
 *   page      dark in the dark theme only, like a card.
 *
 * Both images are the same size, so switching never moves anything.
 */
export function BrandLogo({
  surface,
  className = "",
  imgClassName = "",
}: {
  surface: "sidebar" | "page";
  className?: string;
  imgClassName?: string;
}) {
  return (
    <span data-brand-logo={surface} className={`inline-block ${className}`}>
      {/* eslint-disable-next-line @next/next/no-img-element -- static brand asset, not worth next/image's overhead */}
      <img src="/hmark-logo.png" alt="HMARK Consultants" decoding="async" className={`brand-logo-on-light ${imgClassName}`} />
      {/* Lazy: a hidden image is never fetched, so a light theme never downloads it. */}
      {/* eslint-disable-next-line @next/next/no-img-element -- static brand asset */}
      <img src="/hmark-logo-dark.png" alt="HMARK Consultants" decoding="async" loading="lazy" className={`brand-logo-on-dark ${imgClassName}`} />
    </span>
  );
}
