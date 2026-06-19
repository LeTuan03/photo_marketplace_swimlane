import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth";
import { formatVnd } from "@/lib/money";
import { TIER_LABELS } from "@/lib/constants";
import { getSettings, commissionFor } from "@/lib/settings";
import { PageHeader, StatCard, EscrowStatusBadge } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function SellerDashboard() {
  const user = await requireRole("SELLER", "ADMIN");
  const settings = await getSettings();
  const commissionPct = Math.round(commissionFor(user.sellerTier, settings) * 100);

  const [live, pending, rejected, sales, escrowAgg, recentItems] = await Promise.all([
    prisma.photo.count({ where: { sellerId: user.id, status: "LIVE" } }),
    prisma.photo.count({ where: { sellerId: user.id, status: "PENDING" } }),
    prisma.photo.count({ where: { sellerId: user.id, status: "REJECTED" } }),
    prisma.orderItem.count({ where: { sellerId: user.id, order: { status: "PAID" } } }),
    prisma.escrowHold.aggregate({
      where: { sellerId: user.id, status: "HELD" },
      _sum: { amountVnd: true },
    }),
    prisma.orderItem.findMany({
      where: { sellerId: user.id, order: { status: "PAID" } },
      orderBy: { createdAt: "desc" },
      take: 8,
      include: { photo: { select: { title: true } }, escrow: true },
    }),
  ]);

  const escrowHeld = escrowAgg._sum.amountVnd ?? 0;

  return (
    <div>
      <PageHeader
        title={`Xin chào, ${user.name}`}
        subtitle={`Tier ${TIER_LABELS[user.sellerTier]} · Hoa hồng nền tảng ${commissionPct}%`}
        action={<Link href="/seller/upload" className="btn-primary">Đăng ảnh mới</Link>}
      />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Ảnh đang bán" value={String(live)} hint={`${pending} chờ duyệt · ${rejected} bị từ chối`} />
        <StatCard label="Lượt bán" value={String(sales)} />
        <StatCard label="Đang giữ (escrow)" value={formatVnd(escrowHeld)} hint="Giải ngân sau 7 ngày" />
        <StatCard label="Số dư rút được" value={formatVnd(user.balanceVnd)} hint="Ví khả dụng" />
      </div>

      <h2 className="mb-3 mt-8 font-semibold text-gray-900">Giao dịch gần đây</h2>
      {recentItems.length === 0 ? (
        <div className="card p-6 text-sm text-gray-500">Chưa có giao dịch nào.</div>
      ) : (
        <div className="card divide-y divide-gray-100">
          {recentItems.map((it) => (
            <div key={it.id} className="flex items-center justify-between p-4 text-sm">
              <div>
                <p className="font-medium text-gray-900">{it.photo.title}</p>
                <p className="text-xs text-gray-500">{new Date(it.createdAt).toLocaleString("vi-VN")}</p>
              </div>
              <div className="flex items-center gap-3">
                <span className="font-medium text-emerald-700">+{formatVnd(it.sellerEarningVnd)}</span>
                {it.escrow && <EscrowStatusBadge status={it.escrow.status} />}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
