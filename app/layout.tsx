import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "CareBridge — Doctor Practice",
  description: "MBBS doctor appointment, patient management and digital prescription application.",
  manifest: "/manifest.webmanifest",
  other: {
    "codex-preview": "development", "theme-color": "#0a7568",
  },
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
    <html lang="bn">
      <body className="antialiased">{children}</body>
    </html>
  );
}
