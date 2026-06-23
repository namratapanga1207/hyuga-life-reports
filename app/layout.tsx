import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Hyuga Life — Nutritionist Reports",
  description: "Summary and ticket dump reports by date range",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
