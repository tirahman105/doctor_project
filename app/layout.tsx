import type { Metadata } from "next";
import "./globals.css";
import { DemoProvider } from "@/components/demo/demo-provider";

export const metadata: Metadata = {
  title: "CareBridge — Doctor Practice",
  description:
    "MBBS doctor appointment, patient management and digital prescription application.",
  manifest: "/manifest.webmanifest",
  other: {
    "theme-color": "#0a7568",
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
      <body className="antialiased">
        <DemoProvider>{children}</DemoProvider>
      </body>
    </html>
  );
}
