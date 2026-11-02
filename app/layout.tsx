import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Alibi Arcade — Every game has a story.",
  description: "A home for game nights. Play Mafia with secret roles and six-digit private parties.",
  icons: {
    icon: "/assets/favicon.svg",
    shortcut: "/assets/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
