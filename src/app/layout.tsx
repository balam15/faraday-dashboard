import type { Metadata } from "next";
// Self-hosted Inter (bundled woff2 via @fontsource) so the production build
// needs no network access to Google Fonts. Exposes the same `--font-inter`
// CSS variable that globals.css maps onto `--font-sans`.
import "@fontsource-variable/inter";
import "./globals.css";

const interStyle = { "--font-inter": "'Inter Variable'" } as React.CSSProperties;

export const metadata: Metadata = {
  title: "Vulnera Dashboard",
  description: "Security scanning dashboard — SAST, DAST, Image Scanning",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="h-full antialiased" style={interStyle}>
      <body className="min-h-full flex flex-col font-sans">
        {children}
      </body>
    </html>
  );
}
