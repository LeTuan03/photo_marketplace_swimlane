import Link from "next/link";
import { redirect } from "next/navigation";
import { LayoutDashboard, Upload, Images, Wallet, Receipt } from "lucide-react";
import { requireUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

const nav = [
  { href: "/seller", label: "Tổng quan", icon: LayoutDashboard },
  { href: "/seller/upload", label: "Đăng ảnh", icon: Upload },
  { href: "/seller/inventory", label: "Kho ảnh", icon: Images },
  { href: "/seller/sales", label: "Lịch sử bán", icon: Receipt },
  { href: "/seller/earnings", label: "Thu nhập", icon: Wallet },
];

export default async function SellerLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  // Gating theo role ĐỌC TỪ DB (không phải JWT): người vừa được admin duyệt mở kênh bán
  // vào được ngay mà không cần đăng nhập lại. Người chưa phải seller -> trang đăng ký.
  const user = await requireUser();
  if (user.role !== "SELLER" && user.role !== "ADMIN") redirect("/become-seller");
  return (
    <div className="grid gap-6 md:grid-cols-[200px_1fr]">
      <aside className="md:sticky md:top-20 md:h-fit">
        <p className="mb-2 px-3 text-xs font-semibold uppercase tracking-wide text-gray-400">Kênh người bán</p>
        <nav className="flex gap-1 overflow-x-auto md:flex-col">
          {nav.map((n) => (
            <Link key={n.href} href={n.href} className="flex items-center gap-2 whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium text-gray-600 hover:bg-white hover:text-gray-900">
              <n.icon className="h-4 w-4" /> {n.label}
            </Link>
          ))}
        </nav>
      </aside>
      <section>{children}</section>
    </div>
  );
}
