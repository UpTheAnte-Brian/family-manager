import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  applicationName: "Family Manager",
  title: "Family Manager",
  description: "An iPad-first household console for family routines and daily coordination.",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Family Manager",
  },
  formatDetection: {
    telephone: false,
  },
  manifest: "/manifest.webmanifest",
};

export const viewport: Viewport = {
  themeColor: "#f7f3ea",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased" suppressHydrationWarning>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
