import type { Metadata } from "next";
import { Public_Sans } from "next/font/google";
import { Providers } from "@/components/Providers";
import "./globals.css";

const publicSans = Public_Sans({
  variable: "--font-public-sans",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "HMARK Consultants",
  description: "HMARK Consultants — Student Portal / CRM",
};

// Runs before paint so the stored choices apply immediately — no flash of the
// light theme, and no sidebar sliding away after the page has drawn.
//
// Both live on <html> rather than in React state because the server cannot
// know either: rendering the default and correcting it on hydration is the
// flash this avoids, and for the sidebar it would also shift the whole page
// sideways a moment after it appeared.
const THEME_INIT_SCRIPT = `
try {
  var t = localStorage.getItem('hmark-theme');
  if (t === 'dark' || t === 'semi-dark') document.documentElement.setAttribute('data-theme', t);
  if (localStorage.getItem('hmark-sidebar') === 'hidden') document.documentElement.setAttribute('data-sidebar', 'hidden');
} catch (e) {}
`;

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${publicSans.variable} h-full antialiased`}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body className="min-h-full flex flex-col font-sans">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
