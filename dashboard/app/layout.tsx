import type { Metadata } from "next";
import { Bangers, Comic_Neue } from "next/font/google";
import FlyingSlogans from "./FlyingSlogans";
import "./globals.css";

const bangers = Bangers({
  weight: "400",
  subsets: ["latin"],
  variable: "--font-bangers",
  display: "swap",
});

const comicNeue = Comic_Neue({
  weight: ["400", "700"],
  subsets: ["latin"],
  variable: "--font-comic",
  display: "swap",
});

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
    <html lang="en" className={`${bangers.variable} ${comicNeue.variable}`}>
      <body>
        <FlyingSlogans />
        {children}
      </body>
    </html>
  );
}
