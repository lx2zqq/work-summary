import type { Metadata, Viewport } from "next";
import { Instrument_Serif } from "next/font/google";
import type { ReactNode } from "react";
import { Toaster } from "sonner";
import "./globals.css";

/** 只取拉丁子集，用于日期和统计数字，不加载中文字体包 */
const instrumentSerif = Instrument_Serif({
  weight: "400",
  subsets: ["latin"],
  variable: "--font-instrument-serif",
  display: "swap",
});

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
  themeColor: "#faf8f4",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="zh-CN" className="h-full">
      <body
        className={`app-bg min-h-dvh font-sans ${instrumentSerif.variable}`}
      >
        {children}
        <Toaster
          position="top-center"
          closeButton
          toastOptions={{
            style: {
              borderRadius: "12px",
              border: "1px solid #e8e2d9",
              background: "#ffffff",
              color: "#3f3833",
              fontSize: "14px",
              fontWeight: 500,
              boxShadow: "0 8px 24px -16px rgba(63, 56, 51, 0.24)",
            },
          }}
        />
      </body>
    </html>
  );
}
