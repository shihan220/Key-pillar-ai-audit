import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Key Pillar Ai Audit Log & Task Tracking App",
  description: "Internal audit log and task tracking frontend prototype"
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
