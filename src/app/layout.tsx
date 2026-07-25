import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";
import { Providers } from "./providers";

// Switzer (Fontshare) — the rounded-geometric grotesk from the reference
// dashboard shot (distinctive flat-top "4", open-aperture "5"/"6", rounded
// terminals). Self-hosted via next/font/local since it isn't on Google Fonts;
// files live in public/fonts/switzer. Free for commercial use per Fontshare's
// license (fontshare.com/licenses).
const switzer = localFont({
  variable: "--font-display",
  src: [
    { path: "../../public/fonts/switzer/Switzer-400.woff2", weight: "400", style: "normal" },
    { path: "../../public/fonts/switzer/Switzer-500.woff2", weight: "500", style: "normal" },
    { path: "../../public/fonts/switzer/Switzer-600.woff2", weight: "600", style: "normal" },
    { path: "../../public/fonts/switzer/Switzer-700.woff2", weight: "700", style: "normal" },
  ],
});

export const metadata: Metadata = {
  title: "Diggaj Realty — Dashboard",
  description: "Real-estate resale platform dashboard",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${switzer.variable} h-full antialiased`}>
      <body className="min-h-full">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
