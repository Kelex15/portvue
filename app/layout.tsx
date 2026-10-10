import type { Metadata } from "next";
import { Inter, Geist_Mono } from "next/font/google";
import "./globals.css";
import { themeScript } from "@/lib/theme";
import { MobileNav, Sidebar } from "@/components/shell/sidebar";
import { Topbar } from "@/components/shell/topbar";

const sans = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Portvue",
  description: "Investment Intelligence. See beyond what you own.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`dark ${sans.variable} ${geistMono.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="antialiased">
        <Sidebar />
        <div className="min-h-dvh pb-20 lg:pb-0 lg:pl-60">
          <Topbar />
          <main className="mx-auto max-w-[1280px] space-y-6 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">{children}</main>
          <footer className="mx-auto max-w-[1280px] px-4 pb-8 text-xs text-subtle sm:px-6 lg:px-8">
            Educational, not financial advice.
          </footer>
        </div>
        <MobileNav />
      </body>
    </html>
  );
}
