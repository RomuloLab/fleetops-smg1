import type { Metadata } from "next";
import "./globals.css";
import "./theme.css";
import "./calendarization-countdown.css";
import "./manager-access.css";
import "./stela.css";
import { BRAND_DESCRIPTION, BRAND_TITLE } from "@/config/brand";
import { THEME_BOOTSTRAP } from "@/lib/theme";

export const metadata: Metadata = {
  title: BRAND_TITLE,
  description: BRAND_DESCRIPTION,
  robots: { index: false, follow: false },
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <head><script id="fleetops-theme-init" dangerouslySetInnerHTML={{ __html: THEME_BOOTSTRAP }}/></head>
      <body className="antialiased">{children}</body>
    </html>
  );
}
