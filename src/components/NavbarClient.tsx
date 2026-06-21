"use client";

import { useState } from "react";
import Link from "next/link";
import {
  Camera, Upload, ShoppingCart, LayoutDashboard, Shield, LogOut, Library,
  Bell, ArrowLeftRight, Sparkles, Heart, Receipt, UserCircle, Menu, X, Compass, ChevronDown,
  type LucideIcon,
} from "lucide-react";
import { logoutAction } from "@/app/(auth)/actions";

type Role = "BUYER" | "SELLER" | "ADMIN";
type NavItem = { href: string; label: string; icon: LucideIcon; badge?: number };

export type NavbarClientProps = {
  user: { name: string; role: Role } | null;
  cartCount: number;
  unread: number;
  swapPending: number;
};

function Badge({ value, color = "red" }: { value: number; color?: "red" | "brand" | "fuchsia" }) {
  if (value <= 0) return null;
  const cls = color === "brand" ? "bg-brand-600" : color === "fuchsia" ? "bg-fuchsia-600" : "bg-red-500";
  return (
    <span className={`flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-bold text-white ${cls}`}>
      {value}
    </span>
  );
}

export function NavbarClient({ user, cartCount, unread, swapPending }: NavbarClientProps) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);

  const isSeller = user?.role === "SELLER" || user?.role === "ADMIN";
  const isAdmin = user?.role === "ADMIN";

  const primary: NavItem[] = [
    { href: "/", label: "Khám phá", icon: Compass },
    ...(user
      ? [
          { href: "/swap", label: "Trao đổi", icon: ArrowLeftRight, badge: swapPending },
          { href: "/orders", label: "Đơn mua", icon: Receipt },
          { href: "/library", label: "Thư viện", icon: Library },
        ]
      : []),
  ];

  const account: NavItem[] = user
    ? [
        { href: "/profile", label: "Tài khoản", icon: UserCircle },
        { href: "/subscription", label: "Gói", icon: Sparkles },
        { href: "/wishlist", label: "Yêu thích", icon: Heart },
        ...(isSeller
          ? [
              { href: "/seller/upload", label: "Đăng ảnh", icon: Upload },
              { href: "/seller", label: "Kênh bán", icon: LayoutDashboard },
            ]
          : []),
        ...(isAdmin ? [{ href: "/admin", label: "Quản trị", icon: Shield }] : []),
      ]
    : [];

  const closeAll = () => {
    setMobileOpen(false);
    setAccountOpen(false);
  };

  return (
    <header className="sticky top-0 z-40 border-b border-gray-200 bg-white/90 backdrop-blur">
      <div className="container-app flex h-14 items-center gap-1">
        <Link href="/" onClick={closeAll} className="mr-1 flex items-center gap-2 font-bold text-brand-700">
          <Camera className="h-5 w-5" />
          <span>Picseo</span>
        </Link>

        {/* Liên kết chính (desktop) */}
        <nav className="ml-2 hidden items-center gap-0.5 lg:flex">
          {primary.map((it) => (
            <Link
              key={it.href}
              href={it.href}
              className="relative flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100 hover:text-gray-900"
            >
              <it.icon className="h-4 w-4" /> {it.label}
              <Badge value={it.badge ?? 0} color="fuchsia" />
            </Link>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-1">
          {user ? (
            <>
              <Link href="/notifications" onClick={closeAll} className="relative rounded-lg p-2 text-gray-600 hover:bg-gray-100" title="Thông báo">
                <Bell className="h-5 w-5" />
                <span className="absolute -right-0.5 -top-0.5"><Badge value={unread} /></span>
              </Link>
              <Link href="/cart" onClick={closeAll} className="relative rounded-lg p-2 text-gray-600 hover:bg-gray-100" title="Giỏ hàng">
                <ShoppingCart className="h-5 w-5" />
                <span className="absolute -right-0.5 -top-0.5"><Badge value={cartCount} color="brand" /></span>
              </Link>

              {/* Tài khoản (desktop dropdown) */}
              <div className="relative hidden lg:block">
                <button
                  onClick={() => setAccountOpen((o) => !o)}
                  className="flex items-center gap-1.5 rounded-lg px-2 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100"
                  aria-haspopup="menu"
                  aria-expanded={accountOpen}
                >
                  <UserCircle className="h-5 w-5" />
                  <span className="hidden max-w-[8rem] truncate xl:inline">{user.name}</span>
                  <ChevronDown className="h-4 w-4" />
                </button>
                {accountOpen && (
                  <>
                    <button className="fixed inset-0 z-30 cursor-default" aria-label="Đóng menu" onClick={() => setAccountOpen(false)} />
                    <div className="absolute right-0 z-40 mt-1 w-52 rounded-xl border border-gray-200 bg-white p-1.5 shadow-lg">
                      {account.map((it) => (
                        <Link
                          key={it.href}
                          href={it.href}
                          onClick={closeAll}
                          className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100 hover:text-gray-900"
                        >
                          <it.icon className="h-4 w-4" /> {it.label}
                        </Link>
                      ))}
                      <form action={logoutAction} className="mt-1 border-t border-gray-100 pt-1">
                        <button className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100">
                          <LogOut className="h-4 w-4" /> Đăng xuất
                        </button>
                      </form>
                    </div>
                  </>
                )}
              </div>

              {/* Hamburger (mobile) */}
              <button
                onClick={() => setMobileOpen((o) => !o)}
                className="rounded-lg p-2 text-gray-600 hover:bg-gray-100 lg:hidden"
                aria-label="Mở menu"
                aria-expanded={mobileOpen}
              >
                {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
              </button>
            </>
          ) : (
            <>
              <Link href="/login" className="btn-ghost">Đăng nhập</Link>
              <Link href="/register" className="btn-primary">Đăng ký</Link>
            </>
          )}
        </div>
      </div>

      {/* Panel mobile */}
      {user && mobileOpen && (
        <>
          <button className="fixed inset-x-0 bottom-0 top-14 z-30 bg-black/20 lg:hidden" aria-label="Đóng menu" onClick={() => setMobileOpen(false)} />
          <nav className="absolute inset-x-0 top-14 z-40 max-h-[calc(100vh-3.5rem)] overflow-y-auto border-b border-gray-200 bg-white p-2 shadow-lg lg:hidden">
            <p className="px-3 pb-1 pt-2 text-xs font-semibold uppercase tracking-wide text-gray-400">Duyệt</p>
            {primary.map((it) => (
              <Link
                key={it.href}
                href={it.href}
                onClick={closeAll}
                className="flex items-center gap-2 rounded-lg px-3 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-100"
              >
                <it.icon className="h-4 w-4 text-gray-500" /> {it.label}
                <Badge value={it.badge ?? 0} color="fuchsia" />
              </Link>
            ))}
            <p className="px-3 pb-1 pt-3 text-xs font-semibold uppercase tracking-wide text-gray-400">Tài khoản</p>
            {account.map((it) => (
              <Link
                key={it.href}
                href={it.href}
                onClick={closeAll}
                className="flex items-center gap-2 rounded-lg px-3 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-100"
              >
                <it.icon className="h-4 w-4 text-gray-500" /> {it.label}
              </Link>
            ))}
            <form action={logoutAction} className="mt-1 border-t border-gray-100 pt-1">
              <button className="flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-100">
                <LogOut className="h-4 w-4 text-gray-500" /> Đăng xuất
              </button>
            </form>
          </nav>
        </>
      )}
    </header>
  );
}
