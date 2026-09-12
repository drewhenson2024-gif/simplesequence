import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "SimpleSequence",
  description: "GTM sequences for agents — LinkedIn and email, draft until you start.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
