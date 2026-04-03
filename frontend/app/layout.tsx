import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "InvestSage",
  description: "AI-Powered Portfolio Intelligence",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body suppressHydrationWarning>{children}</body>
    </html>
  );
}
