import { getStaffSession } from "@/lib/auth/session";
import { DEFAULT_LOGIN_FIGURES, isLoginFigureIcon, type LoginFigure } from "@/lib/loginFigures";
import { LoginFiguresForm } from "./LoginFiguresForm";

/**
 * Setup → Login screen: the figures shown on the login page (0278), for a
 * Super Admin — or whoever they grant page.setup.login_screen to.
 */
export default async function LoginScreenSetupPage() {
  const { supabase } = await getStaffSession();
  const { data } = await supabase.from("login_figures").select("value, label, icon").order("sort_order");
  const figures: LoginFigure[] = data?.length
    ? data.map((r) => ({ value: r.value as string, label: r.label as string, icon: isLoginFigureIcon(r.icon) ? r.icon : "star" }))
    : DEFAULT_LOGIN_FIGURES;

  return (
    <div className="mx-auto w-full max-w-4xl">
      <h2 className="mb-1 text-lg font-semibold text-ink">Login screen</h2>
      <p className="mb-4 text-sm text-muted">
        The figures everyone sees on the login page — staff, students and partner universities. Change them as they grow; the
        login page shows the new ones as soon as you save.
      </p>
      <LoginFiguresForm initial={figures} />
    </div>
  );
}
