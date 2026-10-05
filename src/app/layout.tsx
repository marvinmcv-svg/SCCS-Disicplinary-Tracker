import type { Metadata, Viewport } from "next";
import "./globals.css";
import "../spa/spa.css";

export const metadata: Metadata = {
  title: "SCCS Discipline Tracker",
  description: "SCCS Student Discipline Tracking System",
  robots: { index: false, follow: false },
  icons: {
    icon: "/icon.svg",
    apple: "/icon-192.png",
  },
  manifest: "/manifest.json",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#1e40af",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="antialiased">{children}</body>
    </html>
  );
}
