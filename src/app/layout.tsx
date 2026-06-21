import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";
import { Navbar } from "@/components/Navbar";

export const metadata: Metadata = {
  title: "Picseo — Chợ ảnh online",
  description: "Mua, bán và trao đổi ảnh bản quyền. Thanh toán an toàn qua escrow.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="vi">
      <body className="min-h-screen">
        <Navbar />
        <main className="container-app py-6">{children}</main>
        <footer className="border-t border-gray-200 bg-white py-6 text-center text-xs text-gray-400">
          <p>Picseo — Hệ thống mua bán & trao đổi ảnh online · Thanh toán an toàn qua Escrow</p>
          <p className="mt-1">
            <Link href="/verify" className="hover:text-gray-600 hover:underline">Tra cứu license / certificate</Link>
          </p>
        </footer>
      </body>
    </html>
  );
}
