import { ArrowRight, UserRound } from "lucide-react";
import { footerLine, type LoginScreenContent } from "@/lib/loginScreen";
import { LoginForm } from "./LoginForm";

/**
 * The login screen, split as the reference design has it
 * (reference/Login Page/Split Login.png): the story on the left — the brand,
 * a headline, a line under it, a button and a student looking out at the
 * world's landmarks — and the sign-in on the right.
 *
 * On a phone, where most students sign in, the sign-in comes first — signing
 * in should never mean scrolling past a brochure — and the story follows.
 *
 * Every word, link and colour comes from `content` (Setup → Login screen,
 * 0292). `preview` draws the same thing at a fixed 1440×900 for the Setup
 * page's live preview, inert.
 *
 * The page stays light whatever theme the app is set to: it is a branded
 * page, drawn in its own colours.
 */
export function LoginScreenView({
  content,
  pictureUrl,
  year,
  next = "",
  preview = false,
}: {
  content: LoginScreenContent;
  pictureUrl: string;
  year: number;
  /** Where to go once signed in (the login page's ?next=). */
  next?: string;
  preview?: boolean;
}) {
  const external = (url: string) => (url.startsWith("/") ? {} : { target: "_blank", rel: "noreferrer" });
  const style = {
    "--login-accent": content.accentColor,
    "--login-heading": content.headingColor,
    "--login-h": preview ? "900px" : "100dvh",
    fontFamily: "var(--font-login), var(--font-public-sans), system-ui, sans-serif",
  } as React.CSSProperties;

  const footer = (
    <p className="text-center text-[13px] leading-relaxed text-[#626c7c]" data-login-footer>
      {footerLine(content, year)}
      <span className="mt-1 block">
        Partner university?{" "}
        <a href="/register/partner" className="font-semibold text-[var(--login-accent)] hover:underline">
          Register here
        </a>
      </span>
    </p>
  );

  return (
    <div
      className={`login-screen flex flex-col bg-white text-[var(--login-heading)] lg:flex-row ${preview ? "h-[900px] w-[1440px] overflow-hidden" : "min-h-dvh"}`}
      style={style}
      data-login-screen
      inert={preview || undefined}
    >
      {/* ------------------------------------------------------ the story */}
      <section
        className="login-story relative order-2 overflow-hidden lg:order-1 lg:w-[64%]"
        aria-label="About HMARK Consultants"
      >
        <div className="relative z-10 px-6 pb-4 pt-10 sm:px-10 lg:px-[7.8%] lg:pb-0 lg:pt-[4.6%]">
          {/* eslint-disable-next-line @next/next/no-img-element -- static brand asset */}
          <img src="/hmark-logo.png" alt="HMARK Consultants" className="login-rise hidden h-[52px] w-auto lg:block" />
          <p
            className="login-rise text-[15px] font-bold uppercase tracking-[0.24em] text-[var(--login-accent)] lg:mt-[clamp(2rem,7.5vh,4.25rem)] lg:text-[clamp(0.95rem,1.15vw,1.1rem)]"
            style={{ animationDelay: "60ms" }}
            data-login-eyebrow
          >
            {content.eyebrow}
          </p>
          <h1
            className="login-rise mt-4 max-w-[8.8em] text-[clamp(2.35rem,4.35vw,4.4rem)] font-extrabold leading-[1.04] tracking-[-0.035em] text-[var(--login-heading)] lg:mt-5"
            style={{ animationDelay: "120ms" }}
            data-login-headline
          >
            {content.headline}
          </h1>
          <p
            className="login-rise mt-5 max-w-[21em] text-[clamp(1.05rem,1.4vw,1.35rem)] leading-[1.55] text-[#3d4b63] lg:mt-6"
            style={{ animationDelay: "180ms" }}
          >
            {content.subheadline}
          </p>
          <a
            href={content.ctaUrl}
            {...external(content.ctaUrl)}
            className="login-rise group mt-8 inline-flex items-center gap-3 rounded-2xl bg-[var(--login-accent)] px-7 py-4 text-[17px] font-bold text-white shadow-[0_22px_40px_-16px_var(--login-accent)] transition hover:-translate-y-0.5 hover:bg-[color-mix(in_srgb,var(--login-accent)_88%,black)] lg:mt-[clamp(1.75rem,4.5vh,2.5rem)] lg:px-8 lg:text-[clamp(1rem,1.25vw,1.2rem)]"
            style={{ animationDelay: "240ms" }}
            data-login-cta
          >
            {content.ctaLabel}
            <ArrowRight aria-hidden className="h-5 w-5 shrink-0 transition-transform group-hover:translate-x-1" />
          </a>
        </div>

        {/* eslint-disable-next-line @next/next/no-img-element -- one sized picture; the uploaded one comes from a public bucket, so there is nothing for next/image to add */}
        <img
          src={pictureUrl}
          alt={content.imageAlt}
          width={1163}
          height={1080}
          decoding="async"
          fetchPriority="high"
          className="login-picture"
          data-login-picture
        />
      </section>

      {/* ------------------------------------------------------- sign in */}
      <section
        className="order-1 flex flex-col bg-white px-6 pb-8 pt-6 sm:px-10 lg:order-2 lg:w-[36%] lg:px-[4.6%] lg:pb-[3%] lg:pt-[4.4%]"
        aria-label="Sign in"
      >
        <div className="flex items-center justify-between gap-4 lg:justify-end">
          {/* eslint-disable-next-line @next/next/no-img-element -- static brand asset */}
          <img src="/hmark-logo.png" alt="HMARK Consultants" className="h-10 w-auto lg:hidden" />
          <p className="flex items-center gap-2 text-[15px] text-[#626c7c]" data-login-portal>
            <UserRound aria-hidden className="h-5 w-5 shrink-0 text-[var(--login-accent)]" strokeWidth={2} />
            <span className="font-semibold text-[var(--login-accent)]">{content.portalLabel}</span>
            <span className="hidden sm:inline">· {content.portalTagline}</span>
          </p>
        </div>

        <div className="login-rise flex flex-1 flex-col justify-center py-10 lg:py-6" style={{ animationDelay: "100ms" }}>
          <h2 className="text-[clamp(2rem,2.75vw,2.7rem)] font-extrabold leading-tight tracking-[-0.03em] text-[var(--login-heading)]" data-login-welcome>
            {content.welcomeTitle}
          </h2>
          <p className="mt-3 text-[16px] leading-relaxed text-[#4a5568]">{content.welcomeText}</p>
          <LoginForm content={content} next={next} preview={preview} />
        </div>

        <div className="hidden lg:block">{footer}</div>
      </section>

      {/* On a phone the footer closes the page, after the story. */}
      <div className="order-3 bg-[#edf5f9] px-6 py-6 lg:hidden">{footer}</div>
    </div>
  );
}
