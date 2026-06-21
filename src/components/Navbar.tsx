import Link from "next/link";
import { Camera, Upload, ShoppingCart, LayoutDashboard, Shield, LogOut, Library, Bell, ArrowLeftRight, Sparkles, Heart, Receipt, UserCircle } from "lucide-react";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { logoutAction } from "@/app/(auth)/actions";

export async function Navbar() {
  const user = await getCurrentUser();

  let cartCount = 0;
  let unread = 0;
  let swapPending = 0;
  if (user) {
    [cartCount, unread, swapPending] = await Promise.all([
      prisma.cartItem.count({ where: { userId: user.id } }),
      prisma.notification.count({ where: { userId: user.id, readAt: null } }),
      prisma.swapOffer.count({ where: { responderId: user.id, status: "PENDING" } }),
    ]);
  }

  return (
    <header className="sticky top-0 z-40 border-b border-gray-200 bg-white/90 backdrop-blur">
      <div className="container-app flex h-14 items-center gap-2">
        <Link href="/" className="mr-2 flex items-center gap-2 font-bold text-brand-700">
          <Camera className="h-5 w-5" />
          <span>Picseo</span>
        </Link>

        <Link href="/" className="rounded-lg px-3 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100">
          Khám phá
        </Link>

        <div className="ml-auto flex items-center gap-1">
          {user ? (
            <>
              {(user.role === "SELLER" || user.role === "ADMIN") && (
                <>
                  <Link href="/seller/upload" className="hidden items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100 sm:flex">
                    <Upload className="h-4 w-4" /> Đăng ảnh
                  </Link>
                  <Link href="/seller" className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100">
                    <LayoutDashboard className="h-4 w-4" /> Kênh bán
                  </Link>
                </>
              )}
              {user.role === "ADMIN" && (
                <Link href="/admin" className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100">
                  <Shield className="h-4 w-4" /> Admin
                </Link>
              )}
              <Link href="/swap" className="relative flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100">
                <ArrowLeftRight className="h-4 w-4" /> Trao đổi
                {swapPending > 0 && (
                  <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-fuchsia-600 px-1 text-[10px] font-bold text-white">
                    {swapPending}
                  </span>
                )}
              </Link>
              <Link href="/wishlist" className="hidden items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100 lg:flex">
                <Heart className="h-4 w-4" /> Yêu thích
              </Link>
              <Link href="/orders" className="hidden items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100 lg:flex">
                <Receipt className="h-4 w-4" /> Đơn mua
              </Link>
              <Link href="/library" className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100">
                <Library className="h-4 w-4" /> Thư viện
              </Link>
              <Link href="/subscription" className="hidden items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100 lg:flex">
                <Sparkles className="h-4 w-4" /> Gói
              </Link>
              <Link href="/notifications" className="relative rounded-lg p-2 text-gray-600 hover:bg-gray-100">
                <Bell className="h-5 w-5" />
                {unread > 0 && (
                  <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
                    {unread}
                  </span>
                )}
              </Link>
              <Link href="/cart" className="relative rounded-lg p-2 text-gray-600 hover:bg-gray-100">
                <ShoppingCart className="h-5 w-5" />
                {cartCount > 0 && (
                  <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-brand-600 px-1 text-[10px] font-bold text-white">
                    {cartCount}
                  </span>
                )}
              </Link>
              <Link href="/profile" className="ml-1 flex items-center gap-1.5 rounded-lg px-2 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100" title="Tài khoản">
                <UserCircle className="h-5 w-5" />
                <span className="hidden md:inline">{user.name}</span>
              </Link>
              <form action={logoutAction}>
                <button className="rounded-lg p-2 text-gray-500 hover:bg-gray-100" title="Đăng xuất">
                  <LogOut className="h-5 w-5" />
                </button>
              </form>
            </>
          ) : (
            <>
              <Link href="/login" className="btn-ghost">Đăng nhập</Link>
              <Link href="/register" className="btn-primary">Đăng ký</Link>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
