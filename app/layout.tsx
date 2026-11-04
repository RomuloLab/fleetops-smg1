import type { Metadata } from "next";
import "./globals.css";
import "./theme.css";
import "./calendarization-countdown.css";
import "./manager-access.css";
import "./stela.css";
import "./visual.css";
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
      <head>
        <script id="fleetops-theme-init" dangerouslySetInnerHTML={{ __html: THEME_BOOTSTRAP }}/>
        <link rel="preconnect" href="https://fonts.googleapis.com"/>
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin=""/>
        <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600;700;800&family=Geist+Mono:wght@400;500&family=Instrument+Serif:ital@1&display=swap"/>
      </head>
      <body className="antialiased">{children}</body>
    </html>
  );
}
