import type { Metadata } from "next";
import { Public_Sans } from "next/font/google";
import "./globals.css";

const publicSans = Public_Sans({
  variable: "--font-public-sans",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "HMARK Consultants",
  description: "HMARK Consultants — Student Portal / CRM",
};

// Runs before paint so the stored theme choice applies immediately (no
// flash of the light theme while React hydrates).
const THEME_INIT_SCRIPT = `
try {
  var t = localStorage.getItem('hmark-theme');
  if (t === 'dark' || t === 'semi-dark') document.documentElement.setAttribute('data-theme', t);
} catch (e) {}
`;

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${publicSans.variable} h-full antialiased`}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body className="min-h-full flex flex-col font-sans">{children}</body>
    </html>
  );
}
