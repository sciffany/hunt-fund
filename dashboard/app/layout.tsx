import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Hunt Fund",
  description: "Sleep and step accountability for the household.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
