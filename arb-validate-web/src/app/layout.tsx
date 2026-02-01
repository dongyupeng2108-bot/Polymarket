import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Sidebar } from "@/components/sidebar";
import { I18nProvider } from '@/lib/i18n/context';

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Arb-Validate 套利验证",
  description: "Polymarket & Kalshi 跨市场套利验证平台",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body className={`${inter.className} bg-gray-50 text-gray-900`}>
        <I18nProvider>
          <div className="flex min-h-screen">
            <Sidebar />
            <main className="flex-1 ml-64 p-8 overflow-y-auto h-screen">
              {children}
            </main>
          </div>
        </I18nProvider>
      </body>
    </html>
  );
}
