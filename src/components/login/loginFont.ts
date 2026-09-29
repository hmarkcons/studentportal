import { Plus_Jakarta_Sans } from "next/font/google";

/**
 * The login screen's face — the heavy, tightly set geometric sans of the
 * reference design. Loaded for the login page and its Setup preview only, as
 * a CSS variable their wrappers set; the rest of the app stays in Public Sans.
 */
export const loginFont = Plus_Jakarta_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  display: "swap",
  variable: "--font-login",
});
