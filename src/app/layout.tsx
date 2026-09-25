import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

export const metadata: Metadata = {
  title: "InfraShield Dashboard",
  description: "Security scanning dashboard — SAST, DAST, Image Scanning",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${inter.variable} h-full antialiased`}>
      <body className={`min-h-full flex flex-col font-sans ${inter.className}`}>
        {children}
      </body>
    </html>
  );
}
