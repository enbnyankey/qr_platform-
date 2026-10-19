import type { Metadata, Viewport } from "next";
import { Toaster } from "sonner";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "QR Platform", template: "%s · QR Platform" },
  description: "Create dynamic QR codes, digital menus and track every scan.",
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#0d6b5c" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        {/* eslint-disable-next-line @next/next/no-page-custom-font */}
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500&family=IBM+Plex+Sans+Condensed:wght@500;600;700&family=IBM+Plex+Sans:wght@400;500;600&display=swap"
        />
      </head>
      <body className="min-h-screen">
        {children}
        {/* Success / failure messages for anything you add, change or delete. */}
        <Toaster
          position="top-right"
          offset={76}
          richColors
          closeButton
          duration={3500}
          toastOptions={{ style: { fontFamily: "var(--font-sans)", fontSize: "14px", borderRadius: "10px" } }}
        />
      </body>
    </html>
  );
}
