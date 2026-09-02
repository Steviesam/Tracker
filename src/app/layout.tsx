import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-sans",
});

export const metadata: Metadata = {
  title: "Social Metrics Tracker",
  description: "Upload a spreadsheet, detect social video links, fetch available metrics.",
};

/**
 * No `maximum-scale`: pinching to zoom is how someone reads a number they cannot quite make
 * out, and taking it away to stop iOS zooming on a focused input punishes the wrong person.
 * The inputs are sized at 16px on small screens instead, which is what actually stops it.
 */
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={inter.variable}>
      <body className="min-h-screen font-sans antialiased">{children}</body>
    </html>
  );
}
