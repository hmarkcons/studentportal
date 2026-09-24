import { getCachedLoginFigures } from "@/lib/cachedQueries";
import { LoginFigureTiles } from "@/components/LoginFigureTiles";
import { LoginForm } from "./LoginForm";

/**
 * The one door into all three portals — staff, students and partner
 * universities — and, for a student, often the first thing of HMARK's they
 * see. So it says who HMARK is as well as asking for a password.
 *
 * On a computer the story is the green panel beside the form. On a phone,
 * where most students sign in, the form comes first — signing in should never
 * mean scrolling past a brochure — and the story follows below it.
 *
 * The figures are a Super Admin's to change on Setup → Login screen (0278),
 * read from the cache (getCachedLoginFigures).
 */
export default async function LoginPage() {
  const figures = await getCachedLoginFigures();

  return (
    <div className="flex min-h-screen flex-col lg:flex-row">
      {/* ------------------------------------------------ the story */}
      <section
        className="order-2 flex flex-col gap-7 px-6 py-10 text-white sm:px-10 lg:order-1 lg:w-[56%] lg:justify-center lg:px-14 lg:py-12"
        style={{ background: "linear-gradient(140deg, #173f33 0%, #1f6b52 45%, #2e9a74 100%)" }}
        aria-label="About HMARK Consultants"
      >
        <div className="hidden lg:block">
          <span className="inline-block rounded-lg bg-white px-3 py-2 shadow-sm">
            {/* eslint-disable-next-line @next/next/no-img-element -- static brand asset */}
            <img src="/hmark-logo.png" alt="HMARK Consultants" className="h-9 w-auto" />
          </span>
        </div>

        <div className="hidden lg:block">
          <h1 className="max-w-xl text-4xl font-bold leading-tight tracking-tight xl:text-5xl">Your Future Goes Beyond Borders</h1>
          <p className="mt-3 max-w-xl text-lg text-white/85">Your journey to a world-class education starts with HMARK Consultants.</p>
        </div>

        <figure className="relative overflow-hidden rounded-2xl shadow-2xl ring-1 ring-white/15">
          {/* A CC0 stock photo — Caleb Woods on StockSnap
              (stocksnap.io/photo/people-men-3PQLBTZQPC), free to use, no
              credit needed — until HMARK has its own. To swap it, replace
              public/login/happy-graduates.jpg with a photo about 960×278. */}
          {/* eslint-disable-next-line @next/next/no-img-element -- one 48 KB photo, already sized; no optimiser needed */}
          <img
            src="/login/happy-graduates.jpg"
            alt="Graduates celebrating at their graduation ceremony"
            width={960}
            height={278}
            decoding="async"
            className="h-auto w-full object-cover"
          />
          {/* Over the photo where there is room for both; under it on a phone,
              where the photo is too short to carry text without hiding the students. */}
          <figcaption className="bg-black/35 px-4 py-2.5 sm:absolute sm:inset-x-0 sm:bottom-0 sm:bg-transparent sm:bg-gradient-to-t sm:from-black/75 sm:via-black/35 sm:to-transparent sm:px-5 sm:pb-3 sm:pt-12">
            <span className="block text-lg font-bold tracking-wide sm:text-xl">Explore. Apply. Achieve.</span>
            <span className="block text-xs text-white/85 sm:text-sm">With HMARK Consultants, your global education journey starts here.</span>
          </figcaption>
        </figure>

        <LoginFigureTiles figures={figures} />

        <p className="max-w-2xl text-sm leading-relaxed text-white/85">
          Explore study opportunities at leading universities and colleges worldwide. Find the right program, prepare a stronger
          application, and get expert guidance throughout your international education journey.
        </p>
      </section>

      {/* ------------------------------------------------- the form */}
      <section className="order-1 flex flex-1 items-center justify-center bg-bg px-6 py-10 lg:order-2" aria-label="Sign in">
        <div className="w-full max-w-sm">
          {/* On a computer the logo leads the panel beside this; on a phone,
              where the panel is below, it leads the form — with the headline. */}
          <div className="inline-block rounded-md bg-white px-3 py-2 lg:hidden">
            {/* eslint-disable-next-line @next/next/no-img-element -- static brand asset */}
            <img src="/hmark-logo.png" alt="HMARK Consultants" className="h-9 w-auto" />
          </div>
          <div className="mt-5 lg:hidden">
            <h1 className="text-2xl font-bold leading-tight tracking-tight text-ink">Your Future Goes Beyond Borders</h1>
            <p className="mt-1 text-sm text-muted">Your journey to a world-class education starts with HMARK Consultants.</p>
          </div>
          <h2 className="mt-4 text-lg font-semibold text-ink lg:mt-0">Sign in</h2>
          <p className="text-sm text-muted">For staff, students and partner universities.</p>
          <LoginForm />
        </div>
      </section>
    </div>
  );
}
