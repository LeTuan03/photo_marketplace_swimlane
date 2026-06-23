import Link from "next/link";
import { LayoutDashboard, CheckSquare, Users, AlertTriangle, Wallet, Settings, FolderTree, ShieldAlert, QrCode, Undo2, Store, ScanSearch, Landmark } from "lucide-react";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireRole("ADMIN");
  const [pending, openDisputes, payouts, dmca, bankOrders, bankSubs, pendingRefunds, pendingSellers, openMisuse, bankTxnPending] = await Promise.all([
    prisma.photo.count({ where: { status: "PENDING" } }),
    prisma.dispute.count({ where: { status: "OPEN" } }),
    prisma.payout.count({ where: { status: "REQUESTED" } }),
    prisma.dmcaClaim.count({ where: { status: { in: ["OPEN", "COUNTERED"] } } }),
    prisma.order.count({ where: { status: "PENDING", paymentProvider: "BANKQR" } }),
    prisma.subscription.count({ where: { status: "PENDING", paymentProvider: "BANKQR" } }),
    prisma.refundRecord.count({ where: { status: "PENDING" } }),
    prisma.sellerApplication.count({ where: { status: "PENDING" } }),
    prisma.misuseReport.count({ where: { status: "OPEN" } }),
    prisma.bankTransaction.count({ where: { status: { in: ["UNMATCHED", "MISMATCH"] } } }),
  ]);
  const bankPending = bankOrders + bankSubs;

  const nav = [
    { href: "/admin", label: "Tổng quan", icon: LayoutDashboard, badge: 0 },
    { href: "/admin/review", label: "Duyệt ảnh", icon: CheckSquare, badge: pending },
    { href: "/admin/users", label: "Người dùng", icon: Users, badge: 0 },
    { href: "/admin/sellers", label: "Mở kênh bán", icon: Store, badge: pendingSellers },
    { href: "/admin/payments", label: "Chuyển khoản", icon: QrCode, badge: bankPending },
    { href: "/admin/bank-transactions", label: "Biến động số dư", icon: Landmark, badge: bankTxnPending },
    { href: "/admin/disputes", label: "Tranh chấp", icon: AlertTriangle, badge: openDisputes },
    { href: "/admin/refunds", label: "Hoàn tiền", icon: Undo2, badge: pendingRefunds },
    { href: "/admin/dmca", label: "DMCA", icon: ShieldAlert, badge: dmca },
    { href: "/admin/misuse", label: "Dùng sai license", icon: ScanSearch, badge: openMisuse },
    { href: "/admin/payouts", label: "Rút tiền", icon: Wallet, badge: payouts },
    { href: "/admin/categories", label: "Danh mục", icon: FolderTree, badge: 0 },
    { href: "/admin/settings", label: "Cấu hình", icon: Settings, badge: 0 },
  ];

  return (
    <div className="grid gap-6 md:grid-cols-[210px_1fr]">
      <aside className="md:sticky md:top-20 md:h-fit">
        <p className="mb-2 px-3 text-xs font-semibold uppercase tracking-wide text-gray-400">Quản trị</p>
        <nav className="flex gap-1 overflow-x-auto md:flex-col">
          {nav.map((n) => (
            <Link key={n.href} href={n.href} className="flex items-center gap-2 whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium text-gray-600 hover:bg-white hover:text-gray-900">
              <n.icon className="h-4 w-4" /> {n.label}
              {n.badge > 0 && (
                <span className="ml-auto flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1.5 text-[11px] font-bold text-white">
                  {n.badge}
                </span>
              )}
            </Link>
          ))}
        </nav>
      </aside>
      <section>{children}</section>
    </div>
  );
}
