import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { Toaster } from "sonner";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "学管复盘助手",
    template: "%s｜学管复盘助手",
  },
  description:
    "把今天的流水账，整理成可以直接发到钉钉工作群的学管部工作复盘。",
  applicationName: "学管复盘助手",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: "学管复盘",
    statusBarStyle: "default",
  },
  icons: {
    icon: [
      { url: "/icon.svg", type: "image/svg+xml" },
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
    ],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180" }],
  },
};

export const viewport: Viewport = {
  themeColor: "#fff8ee",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="zh-CN" className="h-full">
      <body className="app-bg min-h-dvh font-sans">
        {children}
        <Toaster
          position="top-center"
          closeButton
          toastOptions={{
            style: {
              borderRadius: "18px",
              border: "2px solid #eadccd",
              background: "#fffdf8",
              color: "#4a3b35",
              fontSize: "14px",
              fontWeight: 600,
              boxShadow: "0 4px 0 rgba(91, 70, 60, 0.08)",
            },
          }}
        />
      </body>
    </html>
  );
}
