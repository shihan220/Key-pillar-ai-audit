import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Keypillar AI",
  description: "Internal audit log and task tracking frontend prototype",
  icons: {
    icon: "/brand/keypillar-ai-logo.jpeg",
    shortcut: "/brand/keypillar-ai-logo.jpeg",
    apple: "/brand/keypillar-ai-logo.jpeg"
  }
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
