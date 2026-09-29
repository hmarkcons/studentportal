import { getStaffSession } from "@/lib/auth/session";
import { loginPictureUrl, readLoginScreen } from "@/lib/loginScreen";
import { loginFont } from "@/components/login/loginFont";
import { LoginScreenForm } from "./LoginScreenForm";

/**
 * Setup → Login screen: what the login page says, where its links go, its
 * colours and its picture (0292), for a Super Admin — or whoever they grant
 * page.setup.login_screen to.
 */
export default async function LoginScreenSetupPage() {
  const { supabase } = await getStaffSession();
  const { data } = await supabase.from("login_screen").select("content, image_path").maybeSingle();
  const imagePath = (data?.image_path as string | null | undefined) ?? null;

  return (
    <div className={`${loginFont.variable} w-full`}>
      <h2 className="mb-1 text-lg font-semibold text-ink">Login screen</h2>
      <p className="mb-4 max-w-3xl text-sm text-muted">
        What everyone sees before they sign in — staff, students and partner universities. Change the wording, where the links go,
        the colours and the picture; the preview follows as you type, and the login page shows it as soon as you save.
      </p>
      <LoginScreenForm
        initial={readLoginScreen(data?.content ?? {})}
        pictureUrl={loginPictureUrl(imagePath, process.env.NEXT_PUBLIC_SUPABASE_URL ?? "")}
        customPicture={Boolean(imagePath)}
        year={new Date().getFullYear()}
      />
    </div>
  );
}
