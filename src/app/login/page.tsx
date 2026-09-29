import { getCachedLoginScreen } from "@/lib/cachedQueries";
import { loginPictureUrl, readLoginScreen } from "@/lib/loginScreen";
import { LoginScreenView } from "@/components/login/LoginScreenView";
import { loginFont } from "@/components/login/loginFont";

/**
 * The one door into all three portals — staff, students and partner
 * universities — and, for a student, often the first thing of HMARK's they
 * see. So it says who HMARK is as well as asking for a password.
 *
 * What it says, where its links go, its colours and its picture are a Super
 * Admin's to change on Setup → Login screen (0292), read from the cache
 * (getCachedLoginScreen) and laid over the reference design's defaults.
 */
export default async function LoginPage(props: PageProps<"/login">) {
  const { next } = await props.searchParams;
  const stored = await getCachedLoginScreen();
  return (
    <div className={`${loginFont.variable} flex flex-1 flex-col`}>
      <LoginScreenView
        content={readLoginScreen(stored.content)}
        pictureUrl={loginPictureUrl(stored.imagePath, process.env.NEXT_PUBLIC_SUPABASE_URL ?? "")}
        year={new Date().getFullYear()}
        next={typeof next === "string" ? next : ""}
      />
    </div>
  );
}
