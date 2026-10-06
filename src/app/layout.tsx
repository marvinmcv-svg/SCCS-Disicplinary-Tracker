import type { Metadata, Viewport } from "next";
import { GeistSans } from "geist/font/sans";
import { BOOT_SCRIPT } from "@/lib/boot-script";
import PwaSetup from "./pwa-setup";
import "./globals.css";
import "../spa/spa.css";

export const metadata: Metadata = {
  title: "SCCS Student OS",
  description: "Discipline, learning support and recognition for SCCS.",
  applicationName: "SCCS",
  robots: { index: false, follow: false },
  icons: {
    icon: [
      { url: "/favicon-32.png", sizes: "32x32", type: "image/png" },
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
    ],
    apple: { url: "/apple-touch-icon.png", sizes: "180x180" },
  },
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    title: "SCCS",
    statusBarStyle: "default",
  },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f5f5f7" },
    { media: "(prefers-color-scheme: dark)", color: "#000000" },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={GeistSans.variable} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: BOOT_SCRIPT }} />
      </head>
      <body className="antialiased">
        <PwaSetup />
        {children}
      </body>
    </html>
  );
}
